import React from "react";
import { Body, Text, Left, Right, Card, CardItem, Row, Button } from "native-base";
import { StyleSheet, Image, Linking } from "react-native";

// import { style } from "./ChannelCard";
import { lnrpc } from "../../proto/lightning";
import { blixtTheme } from "../native-base-theme/variables/commonColor";
import { useStoreActions, useStoreState } from "../state/store";
import { identifyService, lightningServices } from "../utils/lightning-services";
import { constructOnchainExplorerUrl } from "../utils/onchain-explorer";

export interface pairDataProps {
  name: string;
  rate: number;
  limits: {
    maximal: number;
    minimal: number;
  }
  fees: {
    percentage: number;
    minerFees: {
      baseAsset: {
        normal: number;
      }
    }
  }
}

export interface IPairDataCardProps {
  pairData: pairDataProps;
}
export const PairDataCard = ({ pairData }: IPairDataCardProps) => {
  const abandonChannel = useStoreActions((store) => store.channel.abandonChannel);
  const getChannels = useStoreActions((store) => store.channel.getChannels);
  const onchainExplorer = useStoreState((store) => store.settings.onchainExplorer);

  console.log('PairDataCard pairData ', pairData, pairData.rate, !pairData.rate);
  if (!pairData.rate) {
    return (<Text>Error: Could not get rates...</Text>);
  }

  // const abandon = async () => {
  //   const result = await abandonChannel({
  //     fundingTx: channel.channel!.channelPoint!.split(":")[0],
  //     outputIndex: Number.parseInt(channel.channel!.channelPoint!.split(":")[1], 10),
  //   });

  //   await getChannels(undefined);
  // };

  // const onPressViewInExplorer = async () => {
  //   const txId = channel.channel?.channelPoint?.split(":")[0];
  //   await Linking.openURL(constructOnchainExplorerUrl(onchainExplorer, txId ?? ""));
  // }

  // const serviceKey = identifyService(channel.channel.remoteNodePub ?? "", "", null);
  // let service;
  // if (serviceKey && lightningServices[serviceKey]) {
  //   service = lightningServices[serviceKey];
  // }

  return (
    <Card style={style.channelCard}>
      <CardItem>
        <Body>
          {/* {alias &&
            <Row style={{ width: "100%" }}>
              <Left style={{ alignSelf: "flex-start" }}>
                <Text style={style.channelDetailTitle}>Alias</Text>
              </Left>
              <Right style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "flex-end" }}>
                <Text style={style.channelDetailValue}>
                  {alias}
                </Text>
                {service &&
                  <Image
                    source={{ uri: service.image }}
                    style={style.nodeImage}
                    width={28}
                    height={28}
                  />
                }
              </Right>
            </Row>
          } */}
          <Row style={style.fullWidth}>
            <Left>
              <Text style={style.channelDetailTitle}>Pair</Text>
            </Left>
            <Right>
              <Text style={{ ...style.channelDetailValue, textAlign: "right" }}>{pairData.name}</Text>
            </Right>
          </Row>
          <Row style={style.fullWidth}>
            <Left>
              <Text style={style.channelDetailTitle}>Rate</Text>
            </Left>
            <Right>
            <Text style={{ ...style.channelDetailValue, textAlign: "right" }}>{Math.round(pairData.rate)}</Text>
            </Right>
          </Row>
          <Row style={style.fullWidth}>
            <Left>
              <Text style={style.channelDetailTitle}>Fee</Text>
            </Left>
            <Right>
              <Text style={ style.channelDetailValue }>%{pairData.fees.percentage}</Text>
            </Right>
          </Row>
          <Row style={style.fullWidth}>
            <Left>
              <Text style={style.channelDetailTitle}>Limits</Text>
            </Left>
            <Right>
              <Text style={ style.channelDetailValue }>Max: {pairData.limits.maximal/10**8}{'\n'}Min: {pairData.limits.minimal/10**8}</Text>
            </Right>
          </Row>
          {/* {type === "OPEN" &&
            <Row style={{ width: "100%" }}>
              <Left>
              <Button style={{ marginTop: 14 }} small={true} onPress={onPressViewInExplorer}>
                <Text style={{ fontSize: 8 }}>View in block explorer</Text>
              </Button>
              </Left>
            </Row>
          } */}
        </Body>
      </CardItem>
    </Card>
  );
};

export default PairDataCard;

export const style = StyleSheet.create({
  fullWidth: {
    width: "100%",
    margin: 8,
  },
  channelCard: {
    width: "100%",
    marginTop: 8,
  },
  channelDetail: {
  },
  channelDetails: {
    fontSize: 16,
  },
  channelDetailTitle: {
  },
  channelDetailValue: {
  },
  channelDetailAmount: {
    fontSize: 15,
  },
  nodeImage: {
    borderRadius: 22,
    marginLeft: 10,
    marginTop: -2.5,
    marginBottom: 4,
  },
});