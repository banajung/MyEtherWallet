import { Transaction } from 'ethereumjs-tx';
import { COOLWALLET as coolWalletType } from '../../bip44/walletTypes';
import HDWalletInterface from '@/wallets/HDWalletInterface';
import { Toast } from '@/helpers';
import errorHandler from './errorHandler';
import cwsETH from '@coolwallets/eth';
import cwsWallet, { generateKeyPair } from '@coolwallets/wallet';
import locStore from 'store';

import store from '@/store';
import {
  getSignTransactionObject,
  sanitizeHex,
  getBufferFromHex,
  calculateChainIdFromV
} from '../../utils';
import commonGenerator from '@/helpers/commonGenerator';

const NEED_PASSWORD = true;
const APP_NAME = 'MyEtherWalletV5';

class CoolWallet {
  constructor() {
    this.identifier = coolWalletType;
    this.isHardware = true;
    this.needPassword = NEED_PASSWORD;
    this.selectedIdx = '';
    this.appPrivateKey = '';
    this.appPublicKey = '';
    this.transport = {};
    this.deviceInstance = {};
  }
  async init(transport) {
    this.transport = transport;
    const hasKeys =
      locStore.get('appPublicKey') && locStore.get('appPrivateKey');
    const hasAppId = locStore.get('appId') || null;
    if (!hasKeys) {
      const {
        publicKey: appPublicKey,
        privateKey: appPrivateKey
      } = generateKeyPair();

      // store it locally on web storage
      locStore.set('appPublicKey', appPublicKey);
      locStore.set('appPrivateKey', appPrivateKey);
      this.appPrivateKey = appPrivateKey;
      this.appPublicKey = appPublicKey;
    } else {
      this.appPrivateKey = locStore.get('appPrivateKey');
      this.appPublicKey = locStore.get('appPublicKey');
    }

    const coolWalletInstance = new cwsWallet(transport, this.appPrivateKey);

    if (!hasAppId) {
      const password = '12345678';
      coolWalletInstance
        .register(this.appPublicKey, password, APP_NAME)
        .then(appId => {
          locStore.set('appId', appId);
          this.appId = appId;
          coolWalletInstance.setAppId(appId);
        })
        .catch(errorHandler);
    } else {
      this.appId = hasAppId;
    }

    this.deviceInstance = await new cwsETH(
      this.transport,
      this.appPrivateKey,
      this.appId
    );
  }

  async getAccount(idx) {
    const address = await this.deviceInstance.getAddress(idx);
    this.selectedIdx = idx;
    // console.log(deviceInstance, this.deviceInstance);
    // const address = await deviceInstance.getAddress(idx);
    const txSigner = async tx => {
      tx = new Transaction(tx, {
        common: commonGenerator(store.state.main.network)
      });
      const networkId = tx.getChainId();
      const result = await cwsETH.signTransaction(tx, this.selectedIdx);
      if (result) {
        const resultTx = new Transaction(tx);
        tx.v = getBufferFromHex(sanitizeHex(resultTx.v.toString('hex')));
        tx.r = getBufferFromHex(sanitizeHex(resultTx.r.toString('hex')));
        tx.s = getBufferFromHex(sanitizeHex(resultTx.s.toString('hex')));
        const signedChainId = calculateChainIdFromV(tx.v);
        if (signedChainId !== networkId)
          Toast.responseHandler(
            new Error(
              'Invalid networkId signature returned. Expected: ' +
                networkId +
                ', Got: ' +
                signedChainId,
              'InvalidNetworkId'
            ),
            false
          );
        return getSignTransactionObject(tx);
      }
      return result;
    };
    const msgSigner = async msg => {
      const result = await cwsETH.signMessage(msg, 0);
      if (result) {
        const signature = result.substr(2);
        const r = '0x' + signature.slice(0, 64);
        const s = '0x' + signature.slice(64, 128);
        const v = '0x' + signature.slice(128, 130);
        return Buffer.concat([
          getBufferFromHex(sanitizeHex(r)),
          getBufferFromHex(sanitizeHex(s)),
          getBufferFromHex(sanitizeHex(v))
        ]);
      }
      return result;
    };
    return new HDWalletInterface(
      null,
      address,
      this.isHardware,
      this.identifier,
      errorHandler,
      txSigner,
      msgSigner,
      null
    );
  }

  getCurrentPath() {
    return "m/44'/60'/0'/0";
  }
  getSupportedPaths() {
    return ["m/44'/60'/0'/0"];
  }
}

const createWallet = async transport => {
  const _coolWallet = new CoolWallet();
  await _coolWallet.init(transport);
  console.log(_coolWallet);
  return _coolWallet;
};
createWallet.errorHandler = errorHandler;

export default createWallet;
