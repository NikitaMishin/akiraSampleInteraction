import { LayerAkiraSDK } from "layerakira-js";
import { Currency } from "../types";
import { ISnapshotInfoPath } from "./config";
import * as SDK from "layerakira-js";
import { getTickerSpec } from "../utils";
import { DirectSnapshotInfoPath } from "./DirectSnapshot";
import { ComplexSorSnapshotInfoPath } from "./ComplexSnaphot";
import { fetchTickerSnapshots } from "./PathProvider";
import { snapshotProvider } from "..";

export const getSnapshot = async ({
  payCurrency,
  receiveCurrency,
  routerSDK,
  tickerSpecs,
  levels,
  decimals,
  externalFunds = true,
}: {
  externalFunds: boolean;
  payCurrency: Currency;
  receiveCurrency: Currency;
  routerSDK: LayerAkiraSDK;
  levels: number;
  tickerSpecs: Array<SDK.TickerSpecification>;
  decimals: SDK.ERCToDecimalsMap;
}): Promise<ISnapshotInfoPath> => {
  // TODO: allow to choose path from snapshotProvider
  let { value: paths } = snapshotProvider.getSnapshotPath(
    payCurrency.code,
    receiveCurrency.code,
  );

  if (!paths || paths.length === 0) {
    await fetchTickerSnapshots(routerSDK, tickerSpecs);
    paths = snapshotProvider.getSnapshotPath(
      payCurrency.code,
      receiveCurrency.code,
    ).value!;
  }

  for (const p of paths) {
    console.log(
      `Pair: ${p.ticker.base} - ${p.ticker.quote}, isSellSide: ${p.isSellSide}`,
    );
  }

  let snaps = await Promise.all(
    paths.map(async (path) => {
      const pair = {
        base: path.ticker.base,
        quote: path.ticker.quote,
      } as SDK.TradedPair;
      const isSellSide = path.isSellSide;
      const tickerSpec = getTickerSpec(
        externalFunds,
        pair.base,
        pair.quote,
        tickerSpecs,
      );
      if (!tickerSpec) return null;
      const snapshotResult = await routerSDK.akiraHttp.getSnapshot(
        tickerSpec.ticker.pair.base,
        tickerSpec.ticker.pair.quote,
        tickerSpec.ticker.isEcosystemBook,
        levels,
      );
      if (snapshotResult.error) return null;
      const snapshot = snapshotResult.result! as SDK.Snapshot;
      return {
        snapshot,
        isSellSide,
        ticker: tickerSpec.ticker,
      };
    }),
  );
  snaps = snaps.filter((s) => s !== null);

  let snapshotPath: ISnapshotInfoPath | undefined = undefined;
  if (snaps && snaps.length > 0) {
    if (snaps.length === 1) {
      const pair = snaps[0]!.ticker.pair;
      snapshotPath = new DirectSnapshotInfoPath(
        snaps[0]!.snapshot,
        snaps[0]!.ticker,
        payCurrency.code === (snaps[0]!.ticker.pair.base as string),
        pair ? decimals[pair.base]! : 0,
        pair ? decimals[pair.quote]! : 0,
      );
      snapshotProvider.updateSnapshotEntry(
        pair.base,
        pair.quote,
        snaps[0]!.snapshot,
      );
    } else {
      snapshotPath = new ComplexSorSnapshotInfoPath(
        snaps?.map((e) => {
          if (e) {
            snapshotProvider.updateSnapshotEntry(
              e.ticker.pair.base,
              e.ticker.pair.quote,
              e.snapshot,
            );

            return {
              snapshot: e.snapshot!,
              isSellSide: e!.isSellSide!,
              ticker: e!.ticker!,
            };
          }

          return null;
        }) ?? [],
        (token: SDK.ERC20Token) => {
          return decimals[token]!;
        },
      );
    }
  }

  return snapshotPath!;
};
