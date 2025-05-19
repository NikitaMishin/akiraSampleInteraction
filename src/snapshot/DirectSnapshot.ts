import * as SDK from "layerakira-js";
import { ISnapshotInfoPath } from "./config";

export class DirectSnapshotInfoPath implements ISnapshotInfoPath {
  public pair: SDK.TradedPair;
  private readonly snap: SDK.Snapshot | null | undefined;
  private readonly spendingToken: SDK.ERC20Token | undefined;
  private readonly receivingToken: SDK.ERC20Token | undefined;
  private readonly exchangeTicker: SDK.ExchangeTicker | undefined;
  private readonly spendingDecimals: number;
  private readonly receivingDecimals: number;

  constructor(
    snap: SDK.Snapshot | null | undefined,
    exchangeTicker: SDK.ExchangeTicker | undefined,
    isSell: boolean,
    baseDecimals: number,
    quoteDecimals: number,
  ) {
    this.pair = exchangeTicker?.pair!;
    this.snap = snap;
    this.exchangeTicker = exchangeTicker;
    this.spendingDecimals = isSell ? baseDecimals : quoteDecimals;
    this.receivingDecimals = isSell ? quoteDecimals : baseDecimals;
    this.spendingToken = isSell
      ? this.exchangeTicker?.pair.base
      : this.exchangeTicker?.pair.quote;
    this.receivingToken = isSell
      ? this.exchangeTicker?.pair.quote
      : this.exchangeTicker?.pair.base;
  }

  isEmpty() {
    return !this.snap;
  }

  isDirectPath() {
    return true;
  }

  countBooks() {
    return 1;
  }

  spendToken(_: number) {
    return this.spendingToken;
  }

  spendTokenDecimals(_: number) {
    return this.spendingDecimals;
  }

  receiveToken(_: number) {
    return this.receivingToken;
  }

  receiveTokenDecimals(_: number) {
    return this.receivingDecimals;
  }

  getSnapshot(index: number) {
    if (index !== 0 || !this.snap) return null;
    return this.snap;
  }

  getExchangeTicker(index: number) {
    if (index !== 0)
      throw new Error("Invalid index: SimpleInfoPath contains only 1 book.");
    return this.exchangeTicker;
  }

  isSellSide(_: number): boolean {
    return this.isSell();
  }

  isEnoughLiquidity(spendAmount: bigint, receiveAmount: bigint) {
    if (!this.snap) return false;
    const isSellSide = this.isSell();
    const receiveLiquidity = this.getReceiveLiquidity();
    const payLiquidity = this.getSpendLiquidity();

    return !(
      (isSellSide && !this.snap?.levels.bids.length) ||
      receiveLiquidity < receiveAmount ||
      payLiquidity < spendAmount ||
      (!isSellSide &&
        (!this.snap?.levels.asks.length ||
          receiveLiquidity < receiveAmount ||
          payLiquidity < spendAmount))
    );
  }

  getReceiveLiquidity() {
    const isSellSide = this.isSell();
    return isSellSide
      ? SDK.calculateTotalQuoteVolume(
          this.snap?.levels.bids ?? [],
          10n ** BigInt(this.spendingDecimals),
        )
      : SDK.calculateTotalBaseVolume(this.snap?.levels.asks ?? []);
  }

  getSpendLiquidity() {
    const isSellSide = this.isSell();
    return isSellSide
      ? SDK.calculateTotalBaseVolume(this.snap?.levels.bids ?? [])
      : SDK.calculateTotalQuoteVolume(
          this.snap?.levels.asks ?? [],
          10n ** BigInt(this.receivingDecimals),
        );
  }

  slicePath(_: number): ISnapshotInfoPath {
    return this;
  }

  private isSell() {
    return this.spendToken(0) == this.exchangeTicker?.pair.base;
  }
}
