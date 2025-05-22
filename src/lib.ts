import { Address, ERC20Token, LayerAkiraSDK } from "layerakira-js";
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
