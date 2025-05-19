import * as SDK from "layerakira-js";
import { ISnapshotInfoPath } from "./config";
import { DirectSnapshotInfoPath } from "./DirectSnapshot";
import { akiraPairInfoProvider } from "./PairProvider";

type Snap =
  | { snapshot: SDK.Snapshot; isSellSide: boolean; ticker: SDK.ExchangeTicker }
  | null
  | undefined;

export class ComplexSorSnapshotInfoPath implements ISnapshotInfoPath {
  public pair: SDK.TradedPair;
  private readonly snaps: Snap[];
  private readonly tokenToDecimal: (token: SDK.ERC20Token) => number;
  private spendFactor: bigint | undefined = undefined;
  private receiveFactor: bigint | undefined = undefined;
  // Use a fixed-point scale to avoid floating point math.
  private static readonly SCALE = 10n ** 18n;

  constructor(
    snaps: Snap[],
    tokenToDecimal: (token: SDK.ERC20Token) => number,
  ) {
    this.snaps = snaps;
    this.tokenToDecimal = tokenToDecimal;
    this.pair = this.decidePair();
  }

  isEmpty() {
    return !this.snaps || this.snaps.length === 0;
  }

  isDirectPath() {
    return false;
  }

  countBooks() {
    return this.snaps?.length ?? 0;
  }

  spendToken(index: number) {
    const spendSnap = this.snaps?.at(index);
    return spendSnap?.isSellSide
      ? spendSnap.ticker.pair.base
      : spendSnap?.ticker.pair.quote;
  }
  receiveToken(index: number) {
    const receiveSnap = this.snaps?.at(index);
    return receiveSnap?.isSellSide
      ? receiveSnap.ticker.pair.quote
      : receiveSnap?.ticker.pair.base;
  }

  spendTokenDecimals(index: number) {
    return this.tokenToDecimal(this.spendToken(index)!);
  }

  receiveTokenDecimals(index: number) {
    return this.tokenToDecimal(this.receiveToken(index)!);
  }

  getSnapshot(index: number) {
    return this.snaps?.at(index)?.snapshot;
  }

  getExchangeTicker(index: number) {
    return this.snaps?.at(index)?.ticker;
  }

  isSellSide(index: number): boolean {
    return this.snaps.at(index)?.isSellSide ?? true;
  }

  private getReceiveLiquidityI(index: number) {
    const snap = this.snaps.at(index)!;
    const isSellSide = snap!.isSellSide;
    // const spendingDecimal = this.tokenToDecimal(isSellSide ? snap.ticker.pair.base : snap.ticker.pair.quote);
    const baseDecimal = this.tokenToDecimal(snap.ticker.pair.base);
    return isSellSide
      ? SDK.calculateTotalQuoteVolume(
          snap.snapshot.levels.bids ?? [],
          10n ** BigInt(baseDecimal),
        )
      : SDK.calculateTotalBaseVolume(snap.snapshot.levels.asks ?? []);
  }
  private getSpendLiquidityI(index: number) {
    const snap = this.snaps.at(index)!;
    const isSellSide = snap!.isSellSide;
    // const receiveDecimal = this.tokenToDecimal(!isSellSide ? snap.ticker.pair.base : snap.ticker.pair.quote);
    const baseDecimal = this.tokenToDecimal(snap.ticker.pair.base);
    return isSellSide
      ? SDK.calculateTotalBaseVolume(snap.snapshot?.levels.bids ?? [])
      : SDK.calculateTotalQuoteVolume(
          snap.snapshot?.levels.asks ?? [],
          10n ** BigInt(baseDecimal),
        );
  }

  /**
   * getSpendLiquidity() chains the conversion ratios from hops 1..N
   * and scales the first hop’s available spend liquidity accordingly.
   *
   * For each hop i (from 1 to countBooks()-1) we compute:
   *     ratioᵢ = getSpendLiquidityI(i) / getReceiveLiquidityI(i)
   *
   * Then the overall effective spend liquidity is:
   *     effectiveSpend = getSpendLiquidityI(0) * (∏₁^(N-1) ratioᵢ)
   *
   * Using fixed-point arithmetic with SCALE.
   */
  getSpendLiquidity() {
    if (this.countBooks() === 0) return 0n;
    const factor = this.calculateSpendFactor();
    // Effective spend liquidity is the first hop's spend liquidity scaled by the chained factor.
    return (
      (this.getSpendLiquidityI(0) * factor) / ComplexSorSnapshotInfoPath.SCALE
    );
  }

  slicePath(index: number): ISnapshotInfoPath {
    const ticker = this.getExchangeTicker(index)!;
    return new DirectSnapshotInfoPath(
      this.snaps.at(index)!.snapshot,
      this.getExchangeTicker(index)!,
      this.isSellSide(index),
      this.tokenToDecimal(ticker.pair.base),
      this.tokenToDecimal(ticker.pair.quote),
    );
  }

  /**
   * getReceiveLiquidity works the same with factor
   */
  getReceiveLiquidity() {
    if (this.countBooks() === 0) return 0n;
    const factor = this.calculateReceiveFactor();
    // Effective spend liquidity is the first hop's spend liquidity scaled by the chained factor.
    return (
      (this.getReceiveLiquidityI(this.countBooks() - 1) * factor) /
      ComplexSorSnapshotInfoPath.SCALE
    );
  }

  isEnoughLiquidity(spendAmount: bigint, receiveAmount: bigint) {
    if (this.isEmpty()) return false;
    const receiveLiquidity = this.getReceiveLiquidity();
    const payLiquidity = this.getSpendLiquidity();

    return !(receiveLiquidity < receiveAmount || payLiquidity < spendAmount);
  }

  private calculateSpendFactor() {
    if (this.spendFactor) return this.spendFactor;
    let factor = ComplexSorSnapshotInfoPath.SCALE; // start with factor = 1.0 in fixed point

    // Loop through hops from index 1 to end
    for (let i = 1; i < this.countBooks(); i++) {
      const receiveLiquidity = this.getReceiveLiquidityI(i - 1);
      if (receiveLiquidity === 0n) {
        factor = 0n;
        break;
      }
      const spendLiquidity = this.getSpendLiquidityI(i);

      const rawRatio =
        (spendLiquidity * ComplexSorSnapshotInfoPath.SCALE) / receiveLiquidity;
      const ratio =
        rawRatio > ComplexSorSnapshotInfoPath.SCALE
          ? ComplexSorSnapshotInfoPath.SCALE
          : rawRatio;
      factor = (factor * ratio) / ComplexSorSnapshotInfoPath.SCALE;
    }
    this.spendFactor = factor;
    return this.spendFactor;
  }

  private calculateReceiveFactor(): bigint {
    if (this.receiveFactor) return this.receiveFactor;
    let factor = ComplexSorSnapshotInfoPath.SCALE; // start with factor = 1.0 in fixed point

    for (let i = this.countBooks() - 1; i >= 1; i--) {
      const spendI = this.getSpendLiquidityI(i);
      const receiveI = this.getReceiveLiquidityI(i - 1);
      if (spendI === 0n) {
        factor = 0n;
        break;
      }
      const rawRatio = (receiveI * ComplexSorSnapshotInfoPath.SCALE) / spendI;
      const ratio =
        rawRatio > ComplexSorSnapshotInfoPath.SCALE
          ? ComplexSorSnapshotInfoPath.SCALE
          : rawRatio;
      factor = (factor * ratio) / ComplexSorSnapshotInfoPath.SCALE;
    }
    this.receiveFactor = factor;
    return factor;
  }

  private decidePair(): SDK.TradedPair {
    const spendToken = this.spendToken(0)!;
    const receiveToken = this.receiveToken(this.countBooks() - 1)!;
    return akiraPairInfoProvider.getAkiraPair(spendToken, receiveToken)!;
  }
}
