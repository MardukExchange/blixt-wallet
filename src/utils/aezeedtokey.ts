import { ethers } from "ethers";
// import * as bip39wordlist from "bip39wordlist";
// const crc32 = require('fast-crc32c');
// import crc from 'crc-react-native';
var crc32c = require("crc-32/crc32c");
const scrypt = require('scrypt-js');
// const scrypt = require('scrypt-async');
const aez = require('aez');
// const bip32utils = require('bip32-utils')
// const bip32utils = require('react-native-bip32-utils');
// import bitcoin from 'bitcoinjs-lib';
const Buffer = require('safe-buffer').Buffer

const AEZEED_DEFAULT_PASSPHRASE = 'aezeed',
  AEZEED_VERSION = 0,
  BITCOIN_GENESIS_BLOCK_TIMESTAMP = 1231006505,
  SCRYPT_N = 32768,
  SCRYPT_R = 8,
  SCRYPT_P = 1,
  SCRYPT_KEY_LENGTH = 32,
  PLAINTEXT_LENGTH = 19,
  ENCIPHERED_LENGTH = 33,
  NUM_WORDS = 24,
  SALT_LENGTH = 5,
  AD_LENGTH = SALT_LENGTH + 1,
  AEZ_TAU = 4,
  CHECKSUM_LENGTH = 4,
  CHECKSUM_OFFSET = ENCIPHERED_LENGTH - CHECKSUM_LENGTH,
  SALT_OFFSET = CHECKSUM_OFFSET - SALT_LENGTH;

export function getRskAccountfromAezeed(mnemonic: string): string | undefined {
    console.log('getRskAccountfromAezeed mnemonic ', mnemonic);
    const words = mnemonic.split(' ');

    if (words.length !== NUM_WORDS) {
        console.log('Must be 24 words!');
        return;
    }

    const belongToList = words.every(word => ethers.wordlists.en.getWordIndex(word) > -1);
    if (!belongToList) {
        console.log('Some words are not in the wordlist!');
        return;
    }

    const bits = words
      .map(word => {
        const index = ethers.wordlists.en.getWordIndex(word);
        return lpad(index.toString(2), '0', 11)
      })
      .join('');
    const seedBytes = bits.match(/(.{1,8})/g)!.map(bin => parseInt(bin, 2));
    // console.log('getRskAccountfromAezeed seedBytes ', seedBytes);
    decodeSeed(Buffer.from(seedBytes));
    // return;
}

function decodeSeed(seed: any) {
    if (!seed || seed.length === 0 || seed[0] !== AEZEED_VERSION) {
      console.log('Invalid seed or version!');
      return;
    }

    // console.log('decodeSeed seed ', seed);
    const salt = seed.slice(SALT_OFFSET, SALT_OFFSET + SALT_LENGTH);
    // vm.passphrase2 || // assuming there's no passphrase on seed
    const password = Buffer.from(AEZEED_DEFAULT_PASSPHRASE, 'utf8');
    const cipherSeed = seed.slice(1, SALT_OFFSET);
    const checksum = seed.slice(CHECKSUM_OFFSET);
    // console.log('1decodeSeed checksum ', checksum);

    const newChecksum = crc32c.buf(seed.slice(0, CHECKSUM_OFFSET));
    // console.log('decodeSeed newChecksum ', newChecksum, checksum.readUInt32BE(0));
    if (newChecksum !== checksum.readUInt32BE(0)) {
        console.log('Invalid seed checksum!');
        return;
    }

    const decoded = {
      salt: salt.toString('hex'),
      entropy: 'please wait...'
    };
    // console.log('decodeSeed scrypt ', password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_KEY_LENGTH);
    const key = scrypt.syncScrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_KEY_LENGTH);
    // scrypt(password, salt, {N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, dkLen: SCRYPT_KEY_LENGTH, encoding: 'hex'}, function (derivedKey:any) {
    //     console.log('decodeSeed derivedKey ', derivedKey);
    // });
    //     .then((key: any) => {
    //         console.log('decodeSeed key?? ', key);
        if (key) {
            // var kb = Buffer.from(key);
            // kb, typeof kb.buffer
            // console.log('decodeSeed key getAD(salt), AEZ_TAU, cipherSeed ', key, getAD(salt), AEZ_TAU, cipherSeed);

            // var newBuffer = new Buffer.alloc(kb.byteLength)
            // for (var i = 0; i < kb.length; i++)
            //     newBuffer[i] = kb[i];

            // console.log('decodeSeed knewBufferey ', newBuffer, typeof newBuffer);
            // const dummybuffer = Buffer.from('1311f8fc80a7ea28d78dd7723f09c44c1754cd35160ca8e7133ae3d7f636a19a', 'hex');
            // console.log('dummybuffer ', dummybuffer, typeof dummybuffer);
            const plainSeedBytes = aez.decrypt(key, null, [getAD(salt)], AEZ_TAU, cipherSeed);
            // console.log('decodeSeed plainSeedBytes ', plainSeedBytes);
            if (plainSeedBytes == null) {
                console.log('Decryption failed. Invalid passphrase?');
                return;
            } else {
                const saltHex = salt.toString('hex');
                const version = plainSeedBytes.readUInt8(0);
                const birthday = plainSeedBytes.readUInt16BE(1);
                const entropy = plainSeedBytes.slice(3).toString('hex');
                const nodeBase58 = fromEntropy(entropy);
                console.log('decodeSeed version, birthday entropy, nodeBase58 ', version, birthday, entropy, saltHex, nodeBase58);
                return {
                    version,
                    birthday,
                    entropy,
                    nodeBase58,
                }
            }
        } else {
            console.log('no key');
        }
    // });
};

function fromEntropy (entropy: any) {
    // , bitcoin.networks.bitcoin // network needed?
    // const nodeBase58 = bip32utils.fromSeed(Buffer.from(entropy, 'hex')).toBase58();
    const hdNode = ethers.utils.HDNode.fromSeed(Buffer.from(entropy, 'hex'));
    // const rskTestNetAccount = hdNode.derivePath(`m/44'/37310'/0'/0/0`);
    const rskAccount = hdNode.derivePath(`m/44'/137'/0'/0/0`);
    console.log('fromEntropy hdNode, rskAccount ', hdNode, rskAccount);
    return rskAccount;
    // return "";
};

function getAD (salt: any) {
    const ad = Buffer.alloc(AD_LENGTH, AEZEED_VERSION);
    salt.copy(ad, 1);
    return ad;
};

function lpad(str: string | any[], padString: string, length: number) {
    while (str.length < length) {
        str = padString + str;
    }
    return str;
}