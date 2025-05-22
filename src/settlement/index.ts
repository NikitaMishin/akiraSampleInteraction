import * as SDK from "layerakira-js";
import { Quantity } from "layerakira-js";
import { ISnapshotInfoPath } from "../snapshot/config";
import { CalcCommand, defaultSettlement, Settlement } from "./model";
import {
  bigIntToFormattedDecimal,
  cleanBaseAmount,
  cleanQuoteAmount,
  formattedDecimalToBigInt,
  getTickerSpec,
} from "../utils";
import { minMMOrderSize } from "../minOrderSize";
import {
  calcPostFeeReceive,
  getMinQtyInQuote,
  getRate,
  receiveSlippage,
  spendSlippage,
  wrapToSlippageBase,
} from "./utils";

//TODO NEED TO TAKE INTO ACCOUNT fees in gas if guy is paying in receiving currency
// TODO: handlded in buildOrder already
/**
 * Estimates the settlement details based on the current state of the swap and market conditions.
 * Validates fields with respect to min traded qty and min increase qty for both base and quote assets
 * @param {Object} params - The parameters for the settlement estimation.
 * @param {SDK.Snapshot} params.snapshot - The snapshot of the order book.
 * @param {Currency} params.payCurrency - The currency used for payment.
 * @param {Currency} params.receiveCurrency - The currency to be received.
 * @param {string} params.payAmount - The amount to be paid.
 * @param {string} params.receiveAmount - The amount to be received.
 * @param {"pay" | "receive"} params.lastUpdatedField - The field that was last updated.
 * @param {SDK.TickerSpecification} params.tickerSpec - The ticker specification.
 * @param {number} params.exchangeFee - The exchange fee in  percent basis points.
 * @returns {Settlement} - The estimated settlement details.
 */
export function estimateSettlement({
  snapshott,
  payAmount,
  receiveAmount,
  lastUpdatedField,
  exchangeFee,
  slippageBips,
  tickerSpecs,
  routerTakerPbips,
}: {
  snapshott: ISnapshotInfoPath;
  // payCurrency: ERC20TokenInfo;
  // receiveCurrency: ERC20TokenInfo;
  payAmount: string;
  receiveAmount: string;
  lastUpdatedField: "pay" | "receive";
  // tickerSpec: SDK.TickerSpecification;
  exchangeFee: number;
  routerTakerPbips: number;
  slippageBips: bigint;
  tickerSpecs: SDK.TickerSpecification[];
}): Settlement {
  const snapshot = snapshott.getSnapshot(0)!;
  const ticker = snapshott.getExchangeTicker(0)!;
  const tickerSpec = getTickerSpec(
    ticker.isEcosystemBook,
    ticker.pair.base,
    ticker.pair.quote,
    tickerSpecs,
  )!;

  const payCurrency = {
    code: snapshott.spendToken(0)!,
    unit: snapshott.spendTokenDecimals(0)!,
  };
  const receiveCurrency = {
    code: snapshott.receiveToken(0)!,
    unit: snapshott.receiveTokenDecimals(0)!,
  };

  slippageBips = slippageBips > 10000n ? 10000n : slippageBips;
  if (!snapshot) return defaultSettlement;

  const bestBid =
    snapshot.levels.bids.length > 0 ? snapshot.levels.bids[0][0] : undefined;
  const bestOffer =
    snapshot.levels.asks.length > 0 ? snapshot.levels.asks[0][0] : undefined;
  const totalFee = routerTakerPbips + exchangeFee;

  const toBigInt = (value: string, decimals: number) =>
    formattedDecimalToBigInt(value, decimals);

  if (tickerSpec.ticker.pair.base === payCurrency.code) {
    const baseAsset = 10n ** BigInt(payCurrency.unit);
    const bids = snapshot!.levels.bids.map((x) => {
      return { price: x[0], volume: x[1], orders: x[2] };
    });
    if (lastUpdatedField == "pay") {
      payAmount = cleanBaseAmount({
        decimals: payCurrency.unit,
        digitsAfterDot: 10,
        levels: snapshot!.levels.bids,
        spec: tickerSpec,
        value: payAmount,
      });
      let actualBaseAmount = toBigInt(payAmount, payCurrency.unit);
      const [receive, numTrades, protectionPrice, unspent] =
        SDK.getOutQuoteForInBase(
          bids,
          actualBaseAmount,
          baseAsset,
          minMMOrderSize
            .get(tickerSpec.ticker.pair.base)
            ?.get(tickerSpec.ticker.pair.quote)!,
        );
      actualBaseAmount = actualBaseAmount - unspent;

      if (actualBaseAmount == 0n) return defaultSettlement;
      const receivePostFee = calcPostFeeReceive(receive, totalFee);
      if (receivePostFee == 0n) return defaultSettlement;
      return {
        numTrades,
        rateStringify: getRate(
          actualBaseAmount,
          receivePostFee,
          payCurrency.unit,
          receiveCurrency.unit,
        ),
        protectionPrice,
        amountIn: actualBaseAmount,
        amountOut: receive,
        receivePostFee,
        command: CalcCommand.SellSpecificBaseForWhateverQuote,
        minReceiveAmount: calcPostFeeReceive(
          receiveSlippage(receive, slippageBips),
          totalFee,
        ),
        quantity: {
          base_asset: baseAsset,
          base_qty: actualBaseAmount,
          quote_qty: 0n,
        },
        // slippagedProtectionPrice: 0n, //TODO: probably some protection over it
        side: SDK.OrderSide.SELL,
        spendSlippaged: actualBaseAmount,
        receiveSlippaged: calcPostFeeReceive(
          receiveSlippage(receive, slippageBips),
          totalFee,
        ),
        priceImpactBips: Number(10000n - (10000n * protectionPrice) / bestBid!),
        context: snapshott,
      };
    } else {
      receiveAmount = cleanQuoteAmount({
        decimals: receiveCurrency.unit,
        digitsAfterDot: 10,
        levels: snapshot!.levels.bids,
        value: receiveAmount,
      });
      let actualReceive = toBigInt(receiveAmount, receiveCurrency.unit);
      // TODO HERE issue with slippage
      let [spend, numTrades, protectionPrice, unspent] =
        SDK.getInBaseForOutQuote(
          bids,
          actualReceive,
          baseAsset,
          minMMOrderSize
            .get(tickerSpec.ticker.pair.base)
            ?.get(tickerSpec.ticker.pair.quote)!,
        );
      // let actualReceive = actualReceive - unspent;
      const actualReceiveForQuote = actualReceive - unspent;
      spend += tickerSpec.rawQuoteQtyIncrement;
      [actualReceive, , ,] = SDK.getOutQuoteForInBase(
        bids,
        spend,
        baseAsset,
        minMMOrderSize
          .get(tickerSpec.ticker.pair.base)
          ?.get(tickerSpec.ticker.pair.quote),
      );
      // actualReceive = (actualReceive * 9996n) / 10000n;
      if (
        !bestBid ||
        actualReceive <
          getMinQtyInQuote(tickerSpec!.rawMinQuoteQty, bestBid, baseAsset)
      )
        return defaultSettlement;

      const receivePostFee = calcPostFeeReceive(actualReceive, totalFee);
      if (receivePostFee == 0n) return defaultSettlement;
      const baseSlippaged = wrapToSlippageBase(
        spend,
        slippageBips,
        tickerSpec!,
        baseAsset,
        true,
      );
      return {
        numTrades,
        amountIn: spend,
        amountOut: actualReceive,
        rateStringify: getRate(
          spend,
          receivePostFee,
          payCurrency.unit,
          receiveCurrency.unit,
        ),
        command: CalcCommand.SellWhateverBaseForSpecificQuote,
        protectionPrice,
        receivePostFee,
        // TODO adhoc, some problem
        minReceiveAmount: calcPostFeeReceive(
          (actualReceiveForQuote * 9999n) / 10000n,
          totalFee,
        ),
        quantity: {
          base_asset: baseAsset,
          base_qty: baseSlippaged,
          quote_qty: actualReceive,
        },
        // slippagedProtectionPrice: 0n,
        side: SDK.OrderSide.SELL,
        spendSlippaged: baseSlippaged,
        receiveSlippaged: calcPostFeeReceive(actualReceive, totalFee),
        priceImpactBips: Number(10000n - (10000n * protectionPrice) / bestBid!),
        context: snapshott,
      };
    }
  }

  if (tickerSpec!.ticker.pair.base === receiveCurrency.code) {
    // buying base asset
    const baseAsset = 10n ** BigInt(receiveCurrency.unit);
    const asks = snapshot!.levels.asks.map((x) => {
      return { price: x[0], volume: x[1], orders: x[2] };
    });
    if (lastUpdatedField == "pay") {
      //
      payAmount = cleanQuoteAmount({
        decimals: payCurrency.unit,
        digitsAfterDot: 10,
        levels: snapshot!.levels.asks,
        value: payAmount,
      });
      let actualPay = toBigInt(payAmount, payCurrency.unit);

      let [receive, numTrades, protectionPrice, unspentPay] =
        SDK.getOutBaseForInQuote(
          asks,
          actualPay,
          baseAsset,
          minMMOrderSize
            .get(tickerSpec.ticker.pair.base)
            ?.get(tickerSpec.ticker.pair.quote),
        );
      receive = SDK.getMatchableAmountInBase(
        0n,
        {
          base_asset: baseAsset,
          // TODO should we replace on minus tick as we do above
          base_qty: (receive * 9996n) / 10000n,
          quote_qty: 0n,
        },
        tickerSpec!.rawMinQuoteQty,
        false,
        tickerSpec!.rawQuoteQtyIncrement,
      );
      actualPay = actualPay - unspentPay;
      // let actualPayForQuote = actualPay - unspentPay
      // let [a,,,] = SDK.getInQuoteForOutBase(asks, receive, baseAsset, tickerSpec.rawMinQuoteQty)
      // actualPay = a * 9999n/10000n
      if (
        !bestOffer ||
        actualPay <
          getMinQtyInQuote(tickerSpec!.rawMinQuoteQty, bestOffer, baseAsset)
      )
        return defaultSettlement;

      const receivePostFee = calcPostFeeReceive(receive, totalFee);
      if (receivePostFee == 0n) return defaultSettlement;
      const receiveSlippaged = wrapToSlippageBase(
        receive,
        slippageBips,
        tickerSpec,
        baseAsset,
        false,
      );
      return {
        numTrades,
        rateStringify: getRate(
          actualPay,
          receivePostFee,
          payCurrency.unit,
          receiveCurrency.unit,
        ),
        amountIn: actualPay,
        amountOut: receive,
        protectionPrice,
        receivePostFee,
        command: CalcCommand.BuyWhateverBaseForSpecificQuote,
        // slippagedProtectionPrice: protectionPrice * 10n, // TODO looks ugly in UI
        minReceiveAmount: calcPostFeeReceive(receiveSlippaged, totalFee),
        quantity: { base_asset: baseAsset, quote_qty: actualPay, base_qty: 0n },
        side: SDK.OrderSide.BUY,
        spendSlippaged: actualPay,
        receiveSlippaged: calcPostFeeReceive(receiveSlippaged, totalFee),
        priceImpactBips: -Number(
          10000n - (10000n * protectionPrice) / bestOffer!,
        ),
        context: snapshott,
      };
    } else {
      receiveAmount = cleanBaseAmount({
        decimals: receiveCurrency.unit,
        digitsAfterDot: 10,
        levels: snapshot!.levels.asks,
        spec: tickerSpec,
        value: receiveAmount,
      });

      let actualBaseAmount = SDK.getMatchableAmountInBase(
        0n,
        {
          base_asset: baseAsset,
          base_qty: toBigInt(receiveAmount, receiveCurrency.unit),
          quote_qty: 0n,
        },
        tickerSpec!.rawMinQuoteQty,
        false,
        tickerSpec!.rawQuoteQtyIncrement,
      );

      const [spend, numTrades, protectionPrice, unspentReceive] =
        SDK.getInQuoteForOutBase(
          asks,
          actualBaseAmount,
          baseAsset,
          minMMOrderSize
            .get(tickerSpec.ticker.pair.base)
            ?.get(tickerSpec.ticker.pair.quote),
        );
      actualBaseAmount -= unspentReceive;
      if (actualBaseAmount == 0n) return defaultSettlement;

      const receivePostFee = calcPostFeeReceive(actualBaseAmount, totalFee);
      if (receivePostFee == 0n) return defaultSettlement;
      return {
        numTrades,
        receivePostFee,
        amountIn: spend,
        amountOut: actualBaseAmount,
        protectionPrice,
        command: CalcCommand.BuySpecificBaseForWhateverQuote,
        rateStringify: getRate(
          spend,
          receivePostFee,
          payCurrency.unit,
          receiveCurrency.unit,
        ),
        minReceiveAmount: calcPostFeeReceive(actualBaseAmount, totalFee),
        // slippagedProtectionPrice: protectionPrice! * 10n, //TODO looks ugly
        quantity: {
          base_asset: baseAsset,
          quote_qty: spendSlippage(spend, slippageBips),
          base_qty: actualBaseAmount,
        },
        side: SDK.OrderSide.BUY,
        spendSlippaged: spendSlippage(spend, slippageBips),
        receiveSlippaged: calcPostFeeReceive(actualBaseAmount, totalFee),
        priceImpactBips: -Number(
          10000n - (10000n * protectionPrice) / bestOffer!,
        ),
        context: snapshott,
      };
    }
  }
  return defaultSettlement;
}

//
//TODO NEED TO TAKE INTO ACCOUNT fees in gas if guy is paying in receiving currency
/**
 * Estimates the settlement details based on the current state of the swap and market conditions.
 * Validates fields with respect to min traded qty and min increase qty for both base and quote assets
 * @param {Object} params - The parameters for the settlement estimation.
 * @param {SwapState} params.swapState - The current state of the swap.
 * @param {string} params.payAmount - The amount to be paid.
 * @param {string} params.receiveAmount - The amount to be received.
 * @param {"pay" | "receive"} params.lastUpdatedField - The field that was last updated.
 * @param {number} params.exchangeFee - The exchange fee in  percent basis points.
 * @returns {Settlement} - The estimated settlement details.
 */
export function estimateSettlementComplex({
  snapshott,
  payAmount,
  receiveAmount,
  lastUpdatedField,
  exchangeFee,
  tickerSpecs,
  slippageBips,
  routerTakerPbips,
}: {
  snapshott: ISnapshotInfoPath;
  payAmount: string;
  receiveAmount: string;
  lastUpdatedField: "pay" | "receive";
  exchangeFee: number;
  slippageBips: bigint;
  tickerSpecs: SDK.TickerSpecification[];
  routerTakerPbips: number;
}): Settlement {
  if (snapshott.countBooks() == 1) {
    return estimateSettlement({
      exchangeFee,
      lastUpdatedField,
      payAmount,
      receiveAmount,
      slippageBips,
      snapshott: snapshott,
      tickerSpecs: tickerSpecs,
      routerTakerPbips,
    });
  }

  //  TODO paid fees always at the end

  const calcIter = (
    iter: number,
    amount: string = "0",
    updatedField: "pay" | "receive" = "pay",
    exchangeFee: number = 0,
    slippageBips: bigint = 0n,
  ) => {
    console.log(amount, "calcIter");
    return estimateSettlement({
      exchangeFee: exchangeFee,
      lastUpdatedField: updatedField,
      payAmount: updatedField == "pay" ? amount : "0",
      receiveAmount: updatedField != "pay" ? amount : "0",
      slippageBips,
      snapshott: snapshott.slicePath(iter),
      tickerSpecs,
      routerTakerPbips,
    });
  };
  let amount = lastUpdatedField == "pay" ? payAmount : receiveAmount;
  let updatedField = lastUpdatedField;
  let settlements = [];

  if (lastUpdatedField == "pay") {
    for (let i = 0; i < snapshott.countBooks(); i++) {
      let exchangeFeeTotal = i == snapshott.countBooks() - 1 ? exchangeFee : 0;
      let settlement = calcIter(
        i,
        amount,
        updatedField,
        exchangeFeeTotal,
        slippageBips,
      );
      settlements.push(settlement);
      if (!settlement.command) return settlement;
      const decimals = snapshott.receiveTokenDecimals(i)!;
      amount = bigIntToFormattedDecimal(
        settlement.amountOut,
        decimals,
        decimals,
      );
      updatedField = "pay";
    }
  } else {
    for (let i = snapshott.countBooks() - 1; i >= 0; i--) {
      const exchangeFeeTotal =
        i == snapshott.countBooks() - 1 ? exchangeFee : 0;
      const settlement = calcIter(
        i,
        amount,
        updatedField,
        exchangeFeeTotal,
        slippageBips,
      );
      settlements.push(settlement);
      if (!settlement.command) return settlement;
      const decimals = snapshott.spendTokenDecimals(i)!;
      amount = bigIntToFormattedDecimal(
        settlement.amountIn,
        decimals,
        decimals,
      );
      updatedField = "receive";
    }

    settlements = settlements.reverse();
  }
  const h = 10_000;
  const lastSettlement = settlements.at(settlements.length - 1)!;
  const firstSettlement = settlements.at(0)!;
  const priceImpactBipsMultplicative =
    h * settlements.reduce((acc, e) => (acc * (h + e.priceImpactBips)) / h, 1) -
    h;
  const receiveDecimals = snapshott.receiveTokenDecimals(
    snapshott.countBooks() - 1,
  )!;
  const payDecimals = snapshott.spendTokenDecimals(0)!;
  return {
    amountIn: firstSettlement.amountIn,
    amountOut: lastSettlement.amountOut,
    command: firstSettlement!.command,
    minReceiveAmount: 0n, //mb unused
    // should we add max spend?
    numTrades: settlements.reduce((acc, e) => acc + e.numTrades, 0),
    priceImpactBips: priceImpactBipsMultplicative,
    protectionPrice: 0n, // makese 0 sense
    quantity: undefined as any as Quantity, // only in order building
    rateStringify: getRate(
      firstSettlement.amountIn,
      lastSettlement.amountOut,
      payDecimals,
      receiveDecimals,
    ), //calculable
    receivePostFee: lastSettlement.receivePostFee, //from last
    receiveSlippaged: lastSettlement.receiveSlippaged, //from last
    side: undefined as any as SDK.OrderSide, // unused only in b
    // slippagedProtectionPrice: 0n,// mb use price impact
    spendSlippaged: firstSettlement.spendSlippaged,
    context: snapshott,
    subSettlements: settlements,
  };

  // TOOD fees
}
