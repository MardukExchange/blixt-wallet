import React, { useState, useEffect, useLayoutEffect } from "react";
import { Button, Icon, H1, Input, Text, Spinner } from "native-base";
import { View } from "react-native";
import Clipboard from "@react-native-community/clipboard";
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'

import { sendKeysendPaymentV2 } from "../../lndmobile/index";
import Long from "long";
import { toast, hexToUint8Array, getHexString, uint8ArrayToString, getHexBuffer, uint8ArrayToUnicodeString, bytesToHexString } from "../../utils";
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
import PairDataCard from "../../components/PairDataCard";
import BigNumber from "bignumber.js";
import { crypto } from 'bitcoinjs-lib';
import { getSeed } from "../../storage/keystore";

interface ILightningInfoProps {
  navigation: StackNavigationProp<RootStackParamList, "KeysendExperiment">;
}
export default function Swap({ navigation }: ILightningInfoProps) {
  const [sending, setSending] = useState(false);
  const myNodeInfo = useStoreState((store) => store.lightning.nodeInfo);
  const [routehints, setRoutehints] = useState("");
  const [pairData, setPairdata] = useState({name: "", rate: 0, limits: {maximal: 0, minimal: 0}, fees: {percentage: 0, minerFees: {baseAsset: {normal: 0}}}});

  const [pubkeyInput, setPubkeyInput] = useState("");
  const [routehintsInput, setRoutehintsInput] = useState("");

  const [baseInput, setBaseInput] = useState("");
  const [quoteInput, setQuoteInput] = useState("");
  const [baseSymbol, setBaseSymbol] = useState("sats");
  const [quoteSymbol, setQuoteSymbol] = useState("xusd");
  const [preimage, setPreimage] = useState("");
  const [preimageHash, setPreimageHash] = useState("");

  const [claimAddress, setClaimAddress] = useState("0x333b238f8ead1230686b32b23070ff4bfb006888");

  const decimals = new BigNumber('100000000');
  const mardukApiUrl = `https://api.marduk.exchange:9001`;
  // const syncTransaction = useStoreActions((store) => store.transaction.syncTransaction);
  
  const name = useStoreState((store) => store.settings.name) || "";

  useEffect(() => {
    (async () => {
      // await getRouteHints();
      await getPairs();

      // doesnt work on web - dummy value
      // const walletseed = await getSeed();
      // console.log('walletseed ', walletseed);

      // prepare preimage and hash for swap
      const generatedPreimageArray = await generateSecureRandom(32);
      // const hash2 = sha("sha256").update(generatedPreimageArray).digest();
      const generatedPreimage = bytesToHexString(generatedPreimageArray);
      // console.log('generatedPreimageArray, generatedPreimageString ', generatedPreimageArray, generatedPreimage);
      const preimageHash = crypto.sha256(getHexBuffer(generatedPreimage));
      setPreimage(generatedPreimage);
      setPreimageHash(getHexString(preimageHash));
      console.log('got preimage, preimagehash: ', generatedPreimage, ' and ', getHexString(preimageHash));
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

  // const calcAmount = (value: string) => {
  //   console.log('calcAmount, pairData.rate ', value, pairData.rate);
  //   const btcxusdrate = pairData.rate;
  //   console.log('xusdAmount ', value*pairData.rate/10**8);
  //   setSatInput(value);
  //   setXusdInput()
  // }

  // const randomBytes = (size: number) => {
  //   const bytes = Buffer.allocUnsafe(size);
  //   global.crypto.getRandomValues(bytes);
  //   return bytes;
  // };

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

    // console.log('updateQuoteAmount ', baseAmount);
    const amount = new BigNumber(baseAmount).dividedBy(decimals);
    const rate = new BigNumber(pairData.rate);
    let fee = calculateFee(amount, rate);
    // console.log('updateQuoteAmount amount, rate ', amount.toNumber(), rate.toNumber());
    // console.log('updateQuoteAmount fee ', fee.toNumber());
    const quote = amount
      .times(rate)
      .minus(fee.times(rate))
      .toFixed(8);
    // console.log('updateQuoteAmount quote ', quote);
    let newQuote = new BigNumber(quote);
    if (newQuote.isLessThanOrEqualTo(0) || newQuote.isNaN()) {
      newQuote = new BigNumber('0');
    }
    // console.log('newQuote ', newQuote);
    setBaseInput(baseAmount);
    setQuoteInput(newQuote.toNumber().toFixed(2));

    // const inputError = !this.checkBaseAmount(amount);
    // this.setState({
    //   quoteAmount: newQuote,
    //   baseAmount: amount,
    //   feeAmount: fee,
    //   inputError,
    //   errorMessage: 'Invalid amount',
    // });
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

  const onClickSend = async () => {
    try {
      if (!baseInput || !quoteInput) {
        throw new Error("Check amount");
      }
      // else if (!pubkeyInput) {
      //   throw new Error("Missing pubkey");
      // }
      setSending(true);

      const createSwapUrl = `${mardukApiUrl}/createswap`;
      const swapRequestBody = {
        "type": "reversesubmarine",
        "pairId": "BTC/XUSD",
        "invoiceAmount": parseFloat(baseInput),
        "orderSide": "sell",
        "claimPublicKey": "0205b9e12976d585fc4e931159952320393e069cb686d54519987545b7e91dc8ad",
        claimAddress,
        preimageHash,
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
    }
    setSending(false);
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
    title: `From: Amount ${baseSymbol}`,
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
      key: "AMOUNT_QUOTE",
      title: `To: Amount  ${quoteSymbol}`,
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

  return (
    <KeyboardAwareScrollView style={{ flex: 1, backgroundColor: blixtTheme.dark }}>
      <View style={{ alignItems: "center" }}>
        <H1 style={{ marginTop: 10, marginBottom: 5 }}>Swap to xUSD</H1>
        {routehints.length > 0  &&
          <QrCode
            onPress={onPressQr}
            size={220}
            data={JSON.stringify({
              pubkey: myNodeInfo!.identityPubkey,
              routehints,
            })}
          />
        }
        {routehints.length === 0 &&
          <View style={{ margin: 4, width: 220 + 26, height: 220 + 26 }}></View>
        }
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
          <Button
            style={{ marginTop: 32 }}
            testID="create-swap"
            primary={true}
            block={true}
            disabled={sending}
            key="CREATE_INVOICE"
            onPress={onClickSend}
          >
            {sending &&
              <Spinner color={blixtTheme.light} />
            }
            {!sending &&
              <Text>Start</Text>
            }
          </Button>
        ]}
      />
    </KeyboardAwareScrollView>
  );
}
