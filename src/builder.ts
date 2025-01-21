import * as SDK from "layerakira-js";

import {
  Address,
  LayerAkiraSDK,
  OrderConstructor,
  SignScheme,
} from "layerakira-js";
import {
  exchangeFeeRecipient,
  routerFeeRecipient,
  routerSigner,
  routerSource,
} from "./constants";
import { ExchangeTicker } from "layerakira-js/src/api";
import { FeeTuple } from "layerakira-js/src/response_types";
import { Settlement } from "./settlement";

export const initializeOrderBuilder = async (
  sdk: LayerAkiraSDK,
  forTrader?: Address,
  nonceTrader?: number,
  fees?: [ExchangeTicker, FeeTuple][],
) => {
  const tickerSpec = await sdk.akiraHttp.queryTickerSpecification();
  const routerSpec = await sdk.akiraHttp.queryRouterSpecification();
  const routerTickerFees = new SDK.TickerFeeMap(
    [0, 0],
    tickerSpec.result!.map((spec) => [
      spec.ticker,
      [
        routerSpec!.result!.routerMakerPbips,
        routerSpec!.result!.routerTakerPbips,
      ],
    ]),
  );
  // 10_00 default
  const tickerFees = new SDK.TickerFeeMap([10_00, 10_00], fees);
  return new SDK.OrderConstructor(
    forTrader!,
    nonceTrader!,
    tickerFees,
    exchangeFeeRecipient!,
    // This better to be parametrized
    250,
    250,
    "STRK",
    routerSource,
    routerTickerFees,
    await routerSigner.getPubKey(),
    routerFeeRecipient,
    SignScheme.ACCOUNT,
  );
};

interface BuildOrderParams {
  settlement: Settlement;
  ticker: SDK.ExchangeTicker;
  gasPrice: bigint;
  gasFeeToken: string;
  gasConversionRate: [bigint, bigint];
  chainHexCode: string;
  accountAddress: string;
  priceTick: bigint;
  orderBuilder: OrderConstructor;
  nonce: number;
  signScheme: SignScheme;
}

export const buildOrder = ({
  settlement,
  ticker,
  gasPrice,
  gasFeeToken,
  gasConversionRate,
  orderBuilder,
  priceTick,
  nonce,
  accountAddress,
  signScheme,
}: BuildOrderParams): SDK.Order => {
  // here we a bit adjust since we control fills by min receive
  const protectionPrice =
    ((settlement.side == SDK.OrderSide.BUY
      ? (settlement.protectionPrice * 120n) / 100n
      : (settlement.protectionPrice * 80n) / 100n) /
      priceTick) *
    priceTick;

  return orderBuilder!.buildSimpleRouterSwap(
    ticker.pair,
    protectionPrice,
    settlement.quantity,
    settlement.numTrades,
    settlement.side,
    gasPrice,
    true,
    settlement.minReceiveAmount,
    gasFeeToken,
    gasConversionRate,
    undefined,
    nonce,
    signScheme,
    accountAddress,
  );
};
