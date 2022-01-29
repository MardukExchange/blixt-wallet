import { ethers } from "ethers";
// import * as bip39wordlist from "bip39wordlist";
const crc32 = require('fast-crc32c');
const scrypt = require('scrypt-js');
const aez = require('aez');
const bip32utils = require('bip32-utils')
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

export function getPrivKeyfromAezeed(mnemonic: string): string | undefined {
    console.log('getPrivKeyfromAezeed mnemonic ', mnemonic);
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
    decodeSeed(Buffer.from(seedBytes));
    return;
}

function decodeSeed(seed: any) {
    if (!seed || seed.length === 0 || seed[0] !== AEZEED_VERSION) {
      console.log('Invalid seed or version!');
      return;
    }

    const salt = seed.slice(SALT_OFFSET, SALT_OFFSET + SALT_LENGTH);
    // vm.passphrase2 || // assuming there's no passphrase on seed
    const password = Buffer.from(AEZEED_DEFAULT_PASSPHRASE, 'utf8');
    const cipherSeed = seed.slice(1, SALT_OFFSET);
    const checksum = seed.slice(CHECKSUM_OFFSET);

    const newChecksum = crc32.calculate(seed.slice(0, CHECKSUM_OFFSET));
    if (newChecksum !== checksum.readUInt32BE(0)) {
        console.log('Invalid seed checksum!');
        return;
    }

    const decoded = {
      salt: salt.toString('hex'),
      entropy: 'please wait...'
    };
    scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_KEY_LENGTH).then((key: any) => {
      if (key) {
        const plainSeedBytes:any = aez.decrypt(key, null, [getAD(salt)], AEZ_TAU, cipherSeed);
        if (plainSeedBytes == null) {
            console.log('Decryption failed. Invalid passphrase?');
            return;
        } else {
            const entropy = plainSeedBytes.slice(3).toString('hex');
            const nodeBase58 = fromEntropy(entropy);
            return {
                version: plainSeedBytes.readUInt8(0),
                birthday: plainSeedBytes.readUInt16BE(1),
                entropy: entropy,
                nodeBase58,
            }
        }
      }
    });
};

function fromEntropy (entropy: any) {
    // , bitcoin.networks.bitcoin // network needed?
    const nodeBase58 = bip32utils.fromSeed(Buffer.from(entropy, 'hex')).toBase58();
    return nodeBase58;
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