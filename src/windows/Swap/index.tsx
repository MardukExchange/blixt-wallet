import React, { useState, useEffect, useLayoutEffect } from "react";
import { Button, Icon, H1, Input, Text, Spinner } from "native-base";
import { View } from "react-native";
import Clipboard from "@react-native-community/clipboard";
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'

import { sendPaymentV2Sync } from "../../lndmobile/index";
import Long from "long";
import { toast, hexToUint8Array, getHexString, uint8ArrayToString, uint8ArrayToUnicodeString, bytesToHexString } from "../../utils";
import { useStoreState, useStoreActions } from "../../state/store";
import { generateSecureRandom } from "react-native-securerandom";
import { lnrpc } from "../../../proto/lightning";
import { getChanInfo, listPrivateChannels } from "../../lndmobile/channel";
import QrCode from "../../components/QrCode";
import BlixtForm from "../../components/Form";
import { NavigationButton } from "../../components/NavigationButton";
import { blixtTheme } from "../../native-base-theme/variables/commonColor";
import { ITransaction } from "../../storage/database/transaction";
import { StackNavigationProp } from "@react-navigation/stack";
import { RootStackParamList } from "../../Main";
import {PairDataCard} from "../../components/PairDataCard";
import {BigNumber} from "bignumber.js";
// import { crypto } from 'bitcoinjs-lib';
import { getSeed } from "../../storage/keystore";
import sha from "sha.js";
import { ethers, BigNumber as BN } from "ethers";
import { getRskAccountfromAezeed } from "../../utils/aezeedtokey";
const {
  getNetwork,
  // Types
  Network,
  Networkish
} = require("@ethersproject/networks");
import "@ethersproject/shims";
import { erc20swapABI, minABI } from "./abi";
import { formatBitcoin, convertBitcoinToFiat } from "../../utils/bitcoin-units";
import logger from "../../utils/log";
const log = logger("Swap");

// this doesnt play nice on android - using web3 directly
// const rskapi = require('rskapi');
// import rskapi from 'rskapi';
// const Web3 = require('web3');
// import Web3 from 'web3';
// const web3 = new Web3('https://public-node.rsk.co');


// mainnet
// const rskUrl = 'https://public-node.rsk.co';
// const chainId = 30;
// const xUSDTokenAddress = "0xb5999795be0ebb5bab23144aa5fd6a02d080299f";
// const erc20SwapAddress = "0x97eee86b78377215230bdf97a7e459e1ff9c63d8";
// const mardukApiUrl = `https://api.marduk.exchange:9001`;

// regtest
// const rskUrl = 'http://192.168.0.143:4444'; // this gives nonetwork error for some reason
const rskUrl = 'https://4444-pseudozach-lnsovbridge-qrl10kz2q0g.ws-us34.gitpod.io/';
console.log('using rskurl: ', rskUrl);
const chainId = 33;
const xUSDTokenAddress = "0x59014d3017a5ad194d6b8a82a34b5b43beca72f7";
const erc20SwapAddress = "0x97eee86b78377215230bdf97a7e459e1ff9c63d8";
const mardukApiUrl = `http://192.168.0.143:9001`;

// rsk chainid: mainnet=30, testnet=31, regtest=33
const rskRpcProvider = new ethers.providers.JsonRpcProvider(rskUrl, chainId);
const xUSDContract = new ethers.Contract(xUSDTokenAddress, minABI, rskRpcProvider);
// let xUSDContract = new web3.eth.Contract(minABI,xUSDTokenAddress);
const erc20SwapContract = new ethers.Contract(erc20SwapAddress, erc20swapABI, rskRpcProvider);


// import { defaultPath, HDNode, entropyToMnemonic, Mnemonic } from "@ethersproject/hdnode";
// import * as bip39 from 'bip39';
// import { generateMnemonic, mnemonicToSeedHex } from 'react-native-bip39'
// if (typeof Buffer === 'undefined') global.Buffer = require('buffer').Buffer

interface ILightningInfoProps {
  navigation: StackNavigationProp<RootStackParamList, "KeysendExperiment">;
}
export default function Swap({ navigation }: ILightningInfoProps) {
  const [sending, setSending] = useState(false);
  const myNodeInfo = useStoreState((store: any) => store.lightning.nodeInfo);
  const [routehints, setRoutehints] = useState("");
  const [pairData, setPairdata] = useState({name: "", rate: 0, limits: {maximal: 0, minimal: 0}, fees: {percentage: 0, minerFees: {baseAsset: {normal: 0}}}});

  // const [pubkeyInput, setPubkeyInput] = useState("");
  // const [routehintsInput, setRoutehintsInput] = useState("");

  const [baseInput, setBaseInput] = useState("");
  const [quoteInput, setQuoteInput] = useState("");
  const [baseSymbol, setBaseSymbol] = useState("sats");
  const [quoteSymbol, setQuoteSymbol] = useState("xusd");
  const [preimage, setPreimage] = useState("");
  const [preimageHash, setPreimageHash] = useState("");

  const [claimAddress, setClaimAddress] = useState("");
  const [xusdBalance, setXusdBalance] = useState("0.00 xUSD");

  const decimals = new BigNumber('100000000');
  const bndecimals = BN.from(10).pow(BN.from(8));
  const ethdecimals = BN.from(10).pow(BN.from(18));
  // const syncTransaction = useStoreActions((store) => store.transaction.syncTransaction);
  
  const name = useStoreState((store: { settings: { name: any; }; }) => store.settings.name) || "";
  const balance = useStoreState((store: { channel: { balance: any; }; }) => store.channel.balance) || "";

  // set/get rsk data from storage - use settings for now.
  const rskAddress = useStoreState((store: { settings: { rskAddress: any; }; }) => store.settings.rskAddress) || "";
  const setRskAddress = useStoreActions((store: { settings: { setRskAddress: any; }; }) => store.settings.setRskAddress);
  const rskPrivateKey = useStoreState((store: { settings: { rskPrivateKey: any; }; }) => store.settings.rskPrivateKey) || "";
  const setRskPrivateKey = useStoreActions((store: { settings: { setRskPrivateKey: any; }; }) => store.settings.setRskPrivateKey);
  // console.log('swap rskAddress, rskPrivateKey ', rskAddress, rskPrivateKey);

  useEffect(() => {
    (async () => {
      // await getRouteHints();
      await getPairs();

      // doesnt work on web - dummy value
      // TODO: do this only if this users rskAccount data is not in storage already
      if(!rskAddress && !rskPrivateKey) {
        const derived = await deriveAddress();
        console.log('derived? ', derived);
        if(derived === undefined) {
          // sometimes aezeed -> bip39 extraction fails - fallback to generating a new seed for RSK
          const newPK = await generateSecureRandom(32);
          const newWallet = new ethers.Wallet(newPK, rskRpcProvider)
          console.log('newWallet:', newWallet)
          // {"_isSigner": true, "_mnemonic": [Function anonymous], "_signingKey": [Function anonymous], "address": "0xf6A094e74073841Cd80D1e60295AFb6f2F6a12Fd", "provider": null}
          if (newWallet.address && newPK) {
            await getRskBalance(newWallet.address.toLowerCase());
    
            setClaimAddress(newWallet.address.toLowerCase());
            console.log('saving rskaccount to store');
            setRskAddress(newWallet.address.toLowerCase());
            setRskPrivateKey(newPK);
          }
        }
      } else {
        console.log('there is already rsk address in store ', rskAddress);
        setClaimAddress(rskAddress);
        await getRskBalance(rskAddress);
      }
      
      await generateSecrets();
    
    })();
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "Swap",
      headerBackTitle: "Back",
      headerShown: true,
      // headerRight: () => {
      //   return (
      //     <NavigationButton onPress={onPressCamera}>
      //       <Icon type="AntDesign" name="camera" style={{ fontSize: 22 }} />
      //     </NavigationButton>
      //   );
      // }
    });
  }, [navigation]);

  const generateSecrets = async () => {
    // prepare preimage and hash for swap
    const generatedPreimageArray = await generateSecureRandom(32);
    const preimageHash = sha("sha256").update(generatedPreimageArray).digest();
    const generatedPreimage = bytesToHexString(generatedPreimageArray);
    // console.log('generatedPreimageArray, generatedPreimageString ', generatedPreimageArray, generatedPreimage);
    // const preimageHash = crypto.sha256(getHexBuffer(generatedPreimage));
    setPreimage(generatedPreimage);
    setPreimageHash(getHexString(preimageHash));
    console.log('got preimage, preimagehash: ', generatedPreimage, ' and ', getHexString(preimageHash));
  }

  const getRskBalance = async (userAccount: any) => {
    // const rskClient = rskapi.client('https://public-node.rsk.co:443')
    // const xusdBalanceHex = await rskClient.call(userAccount, "0xb5999795BE0eBb5BAb23144Aa5fD6a02d080299f", "balanceOf(address)", [userAccount], '');
    // console.log('getRskBalance xusdBalanceHex ', xusdBalanceHex);

    // const xusdBalance = await xUSDContract.methods.balanceOf(userAccount);
    // console.log('getRskBalance xusdBalance ', xusdBalance);

    try {
      // const rskMainnetNetwork = ethers.providers.getNetwork({chainId: 30, name: "RSK mainnet"});
      // const rskMainnetNetwork = new Networkish({chainId: 30, name: "RSK mainnet"})
      // console.log('rsk networkish? ', rskMainnetNetwork);
      
      // const blockNumber = await rskRpcProvider.getBlockNumber()
      // console.log('rsk blockNumber ', blockNumber);
      
      // rskRpcProvider.getBlock(100000).then(console.log)
      // const provider = ...; (use ethers.providers.InfuraProvider for a Node app or ethers.providers.Web3Provider(window.ethereum/window.web3) for a React app)
      
      const balance = await xUSDContract.balanceOf(userAccount.toLowerCase());
      // {"hex": "0x1b845ed858c729e104", "type": "BigNumber"}
      console.log('getRskBalance xusdBalance ', balance);
  
      if(balance) {
        const xUSDdecimalbalance = ethers.utils.formatUnits(balance, 18)
        console.log('xUSDdecimalbalance ', xUSDdecimalbalance)
        setXusdBalance(parseFloat(xUSDdecimalbalance).toFixed(2) + ' xUSD');
      }
      
    } catch (error) {
      console.log('getRskBalance error ', error.message);
    }
  }
  const deriveAddress = async () => {
    try {
      console.log('deriveAddress started - means there was no rsk address in store ', new Date());
      const walletseed = await getSeed();
      let walletmnemonic = walletseed!.join(" ");
      // console.log('deriveAddress walletmnemonic ', walletmnemonic);

      // const dummymnemonic = "ability panic evil predict assume scheme chaos claw solid myself trip voice wagon sphere moral ice merit shoulder accuse leg coin alien burden diet";
      const userRskAccount = getRskAccountfromAezeed(walletmnemonic);
      // const base58 = getPrivKeyfromAezeed(walletmnemonic);
      console.log('deriveAddress userRskAccount ', userRskAccount,  new Date());
      console.log('deriveAddress getting balance for ', userRskAccount.address.toLowerCase());
      if (userRskAccount.address && userRskAccount.privateKey) {
        await getRskBalance(userRskAccount.address.toLowerCase());

        setClaimAddress(userRskAccount.address.toLowerCase());
        console.log('saving rskaccount to store');
        setRskAddress(userRskAccount.address.toLowerCase());
        setRskPrivateKey(userRskAccount.privateKey);
      }
      

      // const seed = bip39.mnemonicToSeedSync(mnemonic)
      
      // console.log('deriveAddress test ', mnemonicToSeedHex('praise you muffin lion enable neck grocery crumble super myself license ghost'));
      // const node = bip32.fromSeed(seed);
      // const strng = node.toBase58();
      // const restored = bip32.fromBase58(strng);
      // const wallet = ethers.Wallet.createRandom({ locale: ethers.wordlists.en });
      // console.log('1mnemonicWallet ', wallet);

      // works with bip39 seed - need aezeed -> bip39
      // let hdNode = ethers.utils.HDNode.fromMnemonic(walletmnemonic);
      // console.log('hdNode pubkey, privkey ', hdNode.publicKey, hdNode.privateKey);

      // // test seed: 'praise you muffin lion enable neck grocery crumble super myself license ghost'
      // // const firstAccount = hdNode.derivePath(`m/44'/60'/0'/0/0`); // eth derivation - 0x296E6b249637aF0E76a0215e5bb73A31bF80F64c
      // const firstAccount = hdNode.derivePath(`m/44'/137'/0'/0/0`); // rsk mainnet derivation - 0x5156bC7Ee88C51442d6840B245d1a7aFC380E61A
      // // const firstAccount = hdNode.derivePath(`m/44'/37310'/0'/0/0`); // rsk testnet derivation - 0x7BD483D5Da59BB917D06f410297c610bc0207A96
      // console.log('hdNode firstAccount ', firstAccount);
    } catch(err) {
      console.log('deriveAddress err', err);
    }

  }

  const updateBaseAmount = (quoteAmount: string) => {
    const amount = new BigNumber(quoteAmount);
    const rate = new BigNumber(pairData.rate);

    const newBase = amount.dividedBy(rate);
    const fee = calculateFee(newBase, rate);

    const newBaseWithFee = fee.plus(newBase).multipliedBy(decimals);
    // const inputError = !this.checkBaseAmount(newBaseWithFee);

    if(!newBaseWithFee.isNaN()) {
      setBaseInput(newBaseWithFee.toFixed(0));
      setQuoteInput(amount.toString());
    } else {
      setBaseInput("0");
      setQuoteInput("0");
    }

    // this.setState({
    //   quoteAmount: amount,
    //   baseAmount: new BigNumber(newBaseWithFee.toFixed(8)),
    //   feeAmount: fee,
    //   inputError,
    //   errorMessage: 'Invalid amount',
    // });
  };

  const updateQuoteAmount = (baseAmount: string) => {
    
    // console.log('updateQuoteAmount pairData ', pairData);
    if (!pairData.rate) return;

    console.log('updateQuoteAmount ', baseAmount);
    
    let amount = new BigNumber(baseAmount).dividedBy(decimals);
    let rate = new BigNumber(pairData.rate);
    if(baseSymbol !== 'sats') {
      amount = new BigNumber(baseAmount);
      rate = new BigNumber(1).div(rate);
    }
    let fee = calculateFee(amount, rate);
    console.log('updateQuoteAmount amount, rate ', amount.toNumber(), rate.toNumber());
    console.log('updateQuoteAmount fee ', fee.toNumber());
    const quote = amount
      .times(rate)
      .minus(fee.times(rate))
      .toFixed(8);
    console.log('updateQuoteAmount quote ', quote);
    let newQuote = new BigNumber(quote);
    if (newQuote.isLessThanOrEqualTo(0) || newQuote.isNaN()) {
      newQuote = new BigNumber('0');
    }
    if(baseSymbol !== 'sats') {
      newQuote = newQuote.multipliedBy(decimals);
    }
    console.log('newQuote ', newQuote);
    setBaseInput(baseAmount);
    setQuoteInput(newQuote.toNumber().toFixed(2));
  };

  const calculateFee = (baseAmount: BigNumber, rate: BigNumber) => {
    const feePercentage = new BigNumber(pairData.fees.percentage/100);
    const percentageFee = feePercentage.times(baseAmount);
    let minerFee = new BigNumber(pairData.fees.minerFees.baseAsset.normal).dividedBy(decimals);
    // console.log('calculateFee minerFee, percentageFee ', minerFee.toNumber(), percentageFee.toNumber());
    // if (this.baseAsset.isLightning) {
    //   minerFee = minerFee.times(new BigNumber(1).dividedBy(rate));
    // }
    if (isNaN(percentageFee.toNumber())) {
      return new BigNumber(0);
    }
    // console.log('calculateFee returning ', percentageFee.plus(minerFee).toNumber());
    return percentageFee.plus(minerFee);
  };

  const onClickFlip = () => {
    // change base <-> quote
    const bs = baseSymbol
    setBaseSymbol(quoteSymbol)
    setQuoteSymbol(baseSymbol)
  }

  const onClickSend = async () => {
    try {
      if (!baseInput || !quoteInput) {
        throw new Error("Check amount");
      }
      if((baseSymbol === 'sats' && balance < baseInput) || 
        (baseSymbol === 'xusd' && xusdBalance < baseInput)) {
        throw new Error("There are not enough funds for this swap.");
      }
      // else if (!pubkeyInput) {
      //   throw new Error("Missing pubkey");
      // }
      setSending(true);

      const swapBaseSymbol = baseSymbol === 'sats' ? 'BTC' : 'XUSD';
      const swapQuoteSymbol = quoteSymbol === 'sats' ? 'BTC' : 'XUSD';
      console.log('swapBaseSymbol, swapQuoteSymbol ', swapBaseSymbol, swapQuoteSymbol);
      const createSwapUrl = `${mardukApiUrl}/createswap`;

      // xusd -> ln
    //   {
    //     "type": "submarine",
    //     "pairId": "BTC/XUSD",
    //     "orderSide": "buy",
    //     "invoice": "lnbcrt125880n1p3pj9uspp5857hqttzsr0r95rstr6pamwtsw5cy89twqwn2sm0vdfy4tpmmtksdqqcqzpgsp5wy4z0yx65ptzws3cean7fm4xr48vsvlv9wp8uqgg9v7hlvnn37fq9qyyssqy08nsms9azt89uyk8alzy9ehq8q46y4u8svnu8fu257tuumnzjkqql50z2lgh6zhjpfsl9d8p62wamgxu2hgqmygjs6u67cyzasr6tgpvewaf0",
    //     "refundPublicKey": "03c2739ad90e81d7525ab3c0f0bfd0af77573a3870bba5f69b184aa59cc93774be",
    //     "channel": {
    //         "auto": true,
    //         "private": false,
    //         "inboundLiquidity": 50
    //     }
    // }
//       acceptZeroConf: false
// address: "0x97eee86b78377215230bdf97a7e459e1ff9c63d8"
// claimAddress: "0xeCb6b2a431826634E36d2787016670EBd8AF5A9B"
// expectedAmount: 499796030
// id: "9Ynxp6"
// redeemScript: "307835393031344433303137413541443139344436623841383261333442356234334265434137324637"
// timeoutBlockHeight: 7155

      const swapRequestBody = {
        "type": "reversesubmarine",
        "pairId": swapBaseSymbol + "/" + swapQuoteSymbol, //"BTC/XUSD",
        "invoiceAmount": parseFloat(baseInput),
        "orderSide": "sell",
        // "claimPublicKey": "0205b9e12976d585fc4e931159952320393e069cb686d54519987545b7e91dc8ad",
        claimAddress,
        preimageHash,
        prepayMinerFee: true,
      }
      console.log('swapRequestBody ', swapRequestBody);
      const result = await fetch(createSwapUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(swapRequestBody),
      });
      let swapResponse = await result.json();
      console.log('swapResponse ', swapResponse);

      // start listening to swap
      const swapStatusUrl = `${mardukApiUrl}/swapstatus`;
      const interval = setInterval(async () => {
        const result2 = await fetch(swapStatusUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({id: swapResponse.id}),
        });
        const swapStatus = await result2.json();
        if(swapStatus.status === 'transaction.confirmed') {
          clearInterval(interval);
          // connect signer
          const rskSigner = new ethers.Wallet(rskPrivateKey, rskRpcProvider)
          const erc20swap = erc20SwapContract.connect(rskSigner)
          // claim xUSD
          const bigAmount = BN.from(swapResponse.onchainAmount).mul(ethdecimals).div(bndecimals);
          // claiming with  0dd78b640bf2bf5932cce5f650e88b3f868da284b07353c76b02127f51500344 4300125120000000000 0x59014d3017a5ad194d6b8a82a34b5b43beca72f7 undefined 12679
          console.log('claiming with ', '0x'+preimage, bigAmount, xUSDTokenAddress, swapResponse.refundAddress, swapResponse.timeoutBlockHeight);
          const claimResult = await erc20swap.claim('0x'+preimage, bigAmount, xUSDTokenAddress, swapResponse.refundAddress, swapResponse.timeoutBlockHeight);
          console.log('claimResult ', claimResult);
          const waited = await claimResult.wait(1);
          console.log('waited ', waited);
          await getRskBalance(rskAddress);
          setSending(false);

          if(waited.status == 1) {
            toast('Swap is successful', undefined, "success");
            // TODO: update btc balance as well
          }
          
          // refresh secrets for a new swap
          generateSecrets();
        }
        if(swapStatus.status === 'transaction.failed') {
          toast(swapStatus.status, undefined, "danger");
          setSending(false);
          generateSecrets();
        }
      }, 1000);
      
      // pay miner invoice
      console.log('paying minerFeeInvoice ', swapResponse.minerFeeInvoice);

      // const sendPaymentResult = await sendPaymentV2Sync(
      //   swapResponse.minerFeeInvoice,
      //   // payload && payload.amount ? Long.fromValue(payload.amount) : undefined,
      //   // name,
      //   // multiPathPaymentsEnabled,
      // );
      // log.i("status", [sendPaymentResult.status, sendPaymentResult.failureReason]);

      // dont wait for this because we need to send 2 payments
      const minerFeeResponse = sendPaymentV2Sync(swapResponse.minerFeeInvoice);
      // log.i("minerFeeResponse", [minerFeeResponse.status, minerFeeResponse.failureReason]);
      // console.log('2minerFeeResponse ', minerFeeResponse);

      // dont wait for this because we need to claim
      // pay swap hold invoice
      const invoiceResponse = sendPaymentV2Sync(swapResponse.invoice);
      console.log('3invoiceResponse ', invoiceResponse);
      
      // const result = await sendKeysendPaymentV2(
      //   pubkeyInput,
      //   Long.fromValue(Number.parseInt(satInput, 10)),
      //   await generateSecureRandom(32),
      //   JSON.parse(routehintsInput || "[]"),
      //   name,
      //   messageInput,
      // );
      // console.log(result);
      // toast("Payment successful");
      // console.log("Payment request is " + result.paymentRequest);
      // console.log(typeof result.paymentRequest);

      // const transaction: ITransaction = {
      //   date: result.creationDate,
      //   description: "Keysend payment",
      //   expire: Long.fromValue(0),
      //   paymentRequest: result.paymentRequest,
      //   remotePubkey: pubkeyInput,
      //   rHash: result.paymentHash,
      //   status: "SETTLED",
      //   value: result.value.neg(),
      //   valueMsat: result.valueMsat.neg().mul(1000),
      //   amtPaidSat: result.value.neg(),
      //   amtPaidMsat: result.valueMsat.neg().mul(1000),
      //   fee: result.fee,
      //   feeMsat: result.feeMsat,
      //   nodeAliasCached: null,
      //   payer: null,
      //   valueUSD: 0,
      //   valueFiat: 0,
      //   valueFiatCurrency: "USD",
      //   locationLong: null,
      //   locationLat: null,
      //   tlvRecordName: null,
      //   type: "NORMAL",
      //   website: null,
      //   identifiedService: null,
      //   lightningAddress: null,
      //   lud16IdentifierMimeType: null,

      //   preimage: hexToUint8Array(result.paymentPreimage),
      //   lnurlPayResponse: null,

      //   hops: [],
      // };
      // syncTransaction(transaction);

    } catch (e) {
      toast(e.message, undefined, "danger");
      setSending(false);
    }
  };

  const getPairs = async () => {
    const getPairUrl = `${mardukApiUrl}/getpairs`;
    const result = await fetch(getPairUrl);
    let btcxusdPairData = (await result.json())["pairs"]["BTC/XUSD"];
    btcxusdPairData.name = "BTC/XUSD"
    console.log('btcxusdPairData ', btcxusdPairData);
    setPairdata(btcxusdPairData);
  }
  
  // const getRouteHints = async () => {
  //   const routeHints: lnrpc.IRouteHint[] = [];
  //   const channels = await listPrivateChannels();

  //   // Follows the code in `addInvoice()` of the lnd project
  //   for (const channel of channels.channels) {
  //     const chanInfo = await getChanInfo(channel.chanId!);
  //     const remotePubkey = channel.remotePubkey;
  //     console.log("chanInfo", chanInfo);

  //     // TODO check if node is publicly
  //     // advertised in the network graph
  //     // https://github.com/lightningnetwork/lnd/blob/38b521d87d3fd9cff628e5dc09b764aeabaf011a/channeldb/graph.go#L2141

  //     let policy: lnrpc.IRoutingPolicy;
  //     if (remotePubkey === chanInfo.node1Pub) {
  //       policy = chanInfo.node1Policy!;
  //     }
  //     else {
  //       policy = chanInfo.node2Policy!;
  //     }

  //     if (!policy) {
  //       continue;
  //     }

  //     routeHints.push(lnrpc.RouteHint.create({
  //       hopHints: [{
  //         nodeId: remotePubkey,
  //         chanId: chanInfo.channelId,
  //         feeBaseMsat: policy.feeBaseMsat ? policy.feeBaseMsat.toNumber() : undefined,
  //         feeProportionalMillionths: policy.feeRateMilliMsat ? policy.feeRateMilliMsat.toNumber() : undefined,
  //         cltvExpiryDelta: policy.timeLockDelta,
  //       }]
  //     }));
  //   }

  //   setRoutehints(JSON.stringify(routeHints));
  // };

  const onPressQr = () => {
    Clipboard.setString(JSON.stringify(routehints));
    toast("Copied to clipboard");
  }

  // const onPressCamera = () => {
  //   navigation.navigate("CameraFullscreen", {
  //     onRead: (data: any) => {
  //       try {
  //         const json = JSON.parse(data);
  //         setPubkeyInput(json.pubkey);
  //         setRoutehintsInput(json.routehints);
  //         console.log(data);
  //       } catch (e) {
  //         setPubkeyInput(data);
  //         console.log(e.message);
  //       }
  //     },
  //   });
  // };

  const formItems = [{
    key: "AMOUNT_BASE",
    title: `From: ${baseSymbol}`,
    component: (
      <Input
        testID="input-amount-sat"
        value={baseInput}
        onChangeText={updateQuoteAmount}
        placeholder="0"
        keyboardType="numeric"
        returnKeyType="done"
      />
    )}, 
    {
      key: "FLIP_BUTTON",
      title: `Change`,
      component: (
        <Button
        style={{ }}
        testID="flip-swap"
        primary={true}
        block={true}
        disabled={!pairData || sending}
        key="FLIP_SWAP"
        onPress={onClickFlip}
      >
        <Text>{baseSymbol} {' 🔄 '} {quoteSymbol}</Text>
      </Button>
      )
    },
    {
      key: "AMOUNT_QUOTE",
      title: `To: ${quoteSymbol}`,
      component: (
        <Input
          testID="input-amount-xusd"
          value={quoteInput}
          onChangeText={updateBaseAmount}
          placeholder="0"
          keyboardType="numeric"
          returnKeyType="done"
        />
      )
    },
    //  {
    //   key: "routehints",
    //   title: `Route hints`,
    //   component: (
    //     <Input
    //       testID="input-routehints"
    //       value={routehintsInput}
    //       onChangeText={setRoutehintsInput}
    //       placeholder="Route hints"
    //     />
    //   )
    // }, {
    //   key: "message",
    //   title: `Message`,
    //   component: (
    //     <Input
    //       testID="input-chatmessage"
    //       value={messageInput}
    //       onChangeText={setMessageInput}
    //       placeholder="Enter a chat message here"
    //     />
    //   )
    // },
  ];

  

  const bitcoinBalance = formatBitcoin(balance, "satoshi", false);
  console.log('bitcoinBalance ', bitcoinBalance);

  return (
    <KeyboardAwareScrollView style={{ flex: 1, backgroundColor: blixtTheme.dark }}>
      <View style={{ alignItems: "center" }}>
        <H1 style={{ marginTop: 10, marginBottom: 5 }}>Swap BTC {'<->'} xUSD</H1>
        <Text style={{color: "whitesmoke"}}>Lightning Balance: {bitcoinBalance}</Text>
        <Text style={{color: "whitesmoke"}}>xUSD Balance: {xusdBalance}</Text>
      </View>
      <View style={{ padding: 16 }}>
        <Text style={{ marginBottom: 8 }}>
          Swap BTC {"<->"} xUSD stablecoin (powered by Marduk.Exchange){"\n"}
          
        </Text>
        <Text>
          Review rates and fees and enter an amount to start a trustless swap.
        </Text>
      </View>
      <PairDataCard pairData={pairData} />
      <BlixtForm
        style={{ flexGrow: 1}}
        items={formItems}
        buttons={[
          <>
          <Button
            style={{ marginTop: 32 }}
            testID="create-swap"
            primary={true}
            block={true}
            disabled={!pairData || sending}
            key="CREATE_SWAP"
            onPress={onClickSend}
          >
            {sending &&
              <Spinner color={blixtTheme.light} />
            }
            {!sending &&
              <Text>Start</Text>
            }
          </Button>
          </>
        ]}
      />
    </KeyboardAwareScrollView>
  );
}
