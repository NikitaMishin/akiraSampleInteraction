import * as SDK from "layerakira-js";
import { TradedPair } from "layerakira-js";

export interface ISnapshotInfoPath {
  pair: TradedPair | undefined | null;
  isEmpty: () => boolean; // equivalent to countBooks == 0
  isDirectPath: () => boolean; // is path direct and no extra hops
  countBooks: () => number; // number of books involved
  spendToken: (index: number) => SDK.ERC20Token | undefined | null; // returns token that is spend on this path
  spendTokenDecimals: (index: number) => number; // decimals of spend token
  receiveToken: (index: number) => SDK.ERC20Token | undefined; //  returns token that is received on this path
  receiveTokenDecimals: (index: number) => number; // decimals of spend token

  getSnapshot: (index: number) => SDK.Snapshot | null | undefined; // returns snapshot for a particular book in the path
  // returns exchange ticker for a particular book in the path
  getExchangeTicker: (index: number) => SDK.ExchangeTicker | null | undefined;
  isSellSide(index: number): boolean;

  isEnoughLiquidity: (spendAmount: bigint, receiveAmount: bigint) => boolean;
  getReceiveLiquidity: () => bigint;
  getSpendLiquidity: () => bigint;

  slicePath: (index: number) => ISnapshotInfoPath; // return slice of len 1
}
