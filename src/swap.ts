import {
  Address,
  ERC20Token,
  LayerAkiraSDK,
  Order,
  OrderConstructor,
  SignScheme,
  TickerSpecification,
} from "layerakira-js";
import { Currency } from "./types";
import { estimateSettlement } from "./settlement";
import { buildOrder } from "./builder";
import { CHAIN_ID } from "./constants";
import { RpcProvider } from "starknet";
import { sleep } from "layerakira-js/dist/api/websocket/utils";

export const queryGasRelated = async (
  sdk: LayerAkiraSDK,
  gasToken: ERC20Token,
): Promise<[bigint, [bigint, bigint]]> => {
  let gasResult = await sdk.akiraHttp.queryGasPrice();
  if (gasToken == "STRK") return [gasResult.result!, [1n, 1n]];
  return [
    gasResult.result!,
    (await sdk.akiraHttp.getConversionRate(gasToken))!.result!,
  ];
};

const getTicker = (
  tickerSpec: Array<TickerSpecification>,
  sellCurrency: Currency,
  buyCurrency: Currency,
) => {
  return tickerSpec.find(
    (e) =>
      (e.ticker.pair.base == sellCurrency.code &&
        e.ticker.pair.quote == buyCurrency.code) ||
      (e.ticker.pair.quote == sellCurrency.code &&
        e.ticker.pair.base == buyCurrency.code),
  );
};

export const buildSwapOrder = async (
  clientAddress: Address,
  clientNonce: number,
  routerSDK: LayerAkiraSDK,
  orderBuilder: OrderConstructor,
  tickerSpec: Array<TickerSpecification>,
  payCurrency: Currency,
  receiveCurrency: Currency,
  gasTokenCurrency: Currency,
  gasPrice: bigint,
  gasConversionRate: [bigint, bigint],
  lastUpdatedField: "pay" | "receive",
  payAmount: bigint,
  receiveAmount: bigint,
  slippageBips: number = 100,
  snip9: boolean = true,
  feeBipsTotal: number = 10_00,
): Promise<[Order, bigint]> => {
  const ticker = getTicker(tickerSpec, payCurrency, receiveCurrency)!;
  // NOTE: just illustrative; you need to maintain depthbook on your backend side
  let snapshot = (
    await routerSDK.akiraHttp.getSnapshot(
      ticker?.ticker.pair.base!,
      ticker?.ticker.pair.quote!,
      false,
      10,
    )
  ).result!;

  let settlement = estimateSettlement({
    snapshot,
    payCurrency,
    receiveCurrency,
    payAmount,
    receiveAmount,
    lastUpdatedField,
    tickerSpec: ticker!,
    feesBips: feeBipsTotal,
    slippageBips: BigInt(slippageBips),
  });

  return [
    buildOrder({
      settlement,
      ticker: ticker!.ticker!,
      // skew a bit
      gasPrice: (gasPrice * 101n) / 100n,
      gasFeeToken: gasTokenCurrency.code,
      gasConversionRate,
      orderBuilder,
      priceTick: ticker.rawPriceIncrement,

      nonce: clientNonce,
      chainHexCode: CHAIN_ID,
      accountAddress: clientAddress,
      signScheme: snip9 ? SignScheme.DIRECT : SignScheme.ACCOUNT,
    }),
    settlement.spendSlippaged,
  ];
};

export const queryTransactionHash = async (
  sdk: LayerAkiraSDK,
  rpcProvider: RpcProvider,
  clientAddress: Address,
  orderHash: string,
) => {
  const searchOrderHash = BigInt(orderHash);
  const startTime = Date.now();
  const TIMEOUT_MS = 15000;
  let BLOCK_BEFORE = 10;
  let latestBlock = await rpcProvider.getBlockNumber()!;
  let continuationToken = undefined;
  while (true) {
    if (Date.now() - startTime > TIMEOUT_MS) {
      return `Timeout: No transaction found for order hash ${orderHash} within ${TIMEOUT_MS / 1000} seconds`;
    }
    let events = await sdk.akiraContract.getTradeEventsFor(
      clientAddress,
      latestBlock - BLOCK_BEFORE,
      "pending",
      false,
      continuationToken,
      50,
    );
    continuationToken = events.result?.continuationToken;
    const firstTrade = events.result?.events.find(
      (e) => BigInt(e.taker_hash) === searchOrderHash,
    );
    if (firstTrade !== undefined) return firstTrade.transaction_hash;
    await sleep(2000);
  }
};
