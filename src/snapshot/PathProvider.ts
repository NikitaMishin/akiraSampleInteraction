import { TradedPair } from "layerakira-js";
import { BestValueProvider } from "./BestValueProvider";
import { snapshotProvider } from "..";
import * as SDK from "layerakira-js";

type MatrixEntry<Entry> = {
  snapshot: Entry;
  isSellSide: boolean;
  ticker: TradedPair;
};

export class SnapshotPathProvider<Entry> {
  private provider: BestValueProvider<MatrixEntry<Entry>, MatrixEntry<Entry>[]>;

  /**
   * @param tokens - Array of token names (nodes).
   * @param maxNodes - Maximum nodes to consider in a path (default is 4).
   */
  constructor(tokens: string[], maxNodes = 4) {
    this.provider = new BestValueProvider(
      tokens,
      (accumulator: MatrixEntry<Entry>[], entry: MatrixEntry<Entry>) =>
        accumulator.concat(entry),
      () => [],
      // value with fewer hops
      (value1: MatrixEntry<Entry>[], value2: MatrixEntry<Entry>[]) =>
        value2.length == 0 || value1.length < value2.length,
      maxNodes,
    );
  }

  /**
   * Updates the matrix entries for a given token pair.
   *
   * @param baseToken - The source token.
   * @param quoteToken - The target token.
   * @param entry - The SnapshotEntry for tokenA -> tokenB.
   */
  updateSnapshotEntry(
    baseToken: string,
    quoteToken: string,
    entry: Entry | null,
  ): boolean {
    if (baseToken == quoteToken) return false;
    this.provider.updateEntry(
      baseToken,
      quoteToken,
      entry
        ? {
            snapshot: entry,
            isSellSide: true,
            ticker: { base: baseToken, quote: quoteToken },
          }
        : null,
      entry
        ? {
            snapshot: entry,
            isSellSide: false,
            ticker: { base: baseToken, quote: quoteToken },
          }
        : null,
    );
    return true;
  }

  /**
   * Finds the best snapshot path (i.e. shortest path) from a starting token to target token.
   *
   * @param forToken - The starting token.
   * @param target - A target token to obtain.
   * @returns An object containing the accumulated SnapshotEntry list (value) and the token path (path),
   *          or null values if no valid path is found.
   */
  getSnapshotPath(
    forToken: string,
    target: string,
  ): { value: MatrixEntry<Entry>[] | null; path: string[] | null } {
    // Use an initial "worst" best value as empty one
    const res = this.provider.getPath([], forToken, new Set([target]));
    if (res.value?.length == 0) return { value: null, path: null };
    return res;
  }
}

export const fetchTickerSnapshots = async (
  routerSDK: SDK.LayerAkiraSDK,
  tickerSpecs: Array<SDK.TickerSpecification>,
  levels: number = 10,
) => {
  console.log("..Fetching Snapshots across all tickers..");
  for (const tickerSpec of tickerSpecs) {
    const snapshot = await routerSDK.akiraHttp.getSnapshot(
      tickerSpec.ticker.pair.base,
      tickerSpec.ticker.pair.quote,
      tickerSpec.ticker.isEcosystemBook,
      levels,
    );
    if (snapshot.result) {
      snapshotProvider.updateSnapshotEntry(
        tickerSpec.ticker.pair.base,
        tickerSpec.ticker.pair.quote,
        snapshot.result,
      );
    }
  }
};
