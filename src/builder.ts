import * as SDK from "layerakira-js";

import { Address, LayerAkiraSDK, SignScheme } from "layerakira-js";
import {
  exchangeFeeRecipient,
  routerFeeRecipient,
  routerSigner,
  routerSource,
} from "./constants";
import { ExchangeTicker } from "layerakira-js/src/api";
import { FeeTuple } from "layerakira-js/src/response_types";

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
