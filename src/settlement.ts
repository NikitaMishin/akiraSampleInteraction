import * as SDK from "layerakira-js";
import { OrderSide } from "layerakira-js";

import { cleanBaseAmount } from "./utils";
import { Currency } from "./types";
import { minMMOrderSize } from "./minOrderSize";

/**
 * Enum representing different calculation commands for the swap process.
 */
export enum CalcCommand {
  SellWhateverBaseForSpecificQuote = 1,
  BuyWhateverBaseForSpecificQuote,
  BuySpecificBaseForWhateverQuote,
  SellSpecificBaseForWhateverQuote,
}

/**
 * Interface representing the settlement details.
 */
export interface Settlement {
  numTrades: number; // Number of trades involved in the settlement
  protectionPrice: bigint; // Protection price for the settlement
  minReceiveAmount: bigint; // Minimum amount to receive considering slippage
  quantity: SDK.Quantity; // Quantity details for building order
  side: SDK.OrderSide; // Side of the order (buy or sell)
  command: CalcCommand | undefined; // Calculation command used
  spendSlippaged: bigint;
}

const defaultSettlement: Settlement = {
  numTrades: 0,
  protectionPrice: 0n,
  minReceiveAmount: 0n,
  quantity: { base_asset: 0n, quote_qty: 0n, base_qty: 0n },
  command: undefined,
  side: OrderSide.SELL,
  spendSlippaged: 0n,
};

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
 * @param {number} params.feesBips - The exchange fee in  percent basis points.
 * @param {number} params.slippageBips - slippage.
 * @returns {Settlement} - The estimated settlement details.
 */
export function estimateSettlement({
  snapshot,
  payCurrency,
  receiveCurrency,
  payAmount,
  receiveAmount,
  lastUpdatedField,
  tickerSpec,
  feesBips,
  slippageBips,
}: {
  snapshot: SDK.Snapshot;
  payCurrency: Currency;
  receiveCurrency: Currency;
  payAmount: bigint;
  receiveAmount: bigint;
  lastUpdatedField: "pay" | "receive";
  tickerSpec: SDK.TickerSpecification;
  feesBips: number;
  slippageBips: bigint;
}): Settlement {
  slippageBips = slippageBips > 10000n ? 10000n : slippageBips;

  const bestBid =
    snapshot.levels.bids.length > 0 ? snapshot.levels.bids[0][0] : undefined;
  const bestOffer =
    snapshot.levels.asks.length > 0 ? snapshot.levels.asks[0][0] : undefined;

  if (tickerSpec.ticker.pair.base === payCurrency.code) {
    const baseAsset = 10n ** BigInt(payCurrency.unit);
    const bids = snapshot!.levels.bids.map((x) => {
      return { price: x[0], volume: x[1], orders: x[2] };
    });
    if (lastUpdatedField == "pay") {
      let actualBaseAmount = cleanBaseAmount({
        decimals: payCurrency.unit,
        spec: tickerSpec,
        value: payAmount,
      });
      const [receive, numTrades, protectionPrice, unspent] =
        SDK.getOutQuoteForInBase(
          bids,
          actualBaseAmount,
          baseAsset,
          minMMOrderSize
            .get(tickerSpec.ticker.pair.base)!
            .get(tickerSpec.ticker.pair.quote)!,
        );
      actualBaseAmount = actualBaseAmount - unspent;

      if (actualBaseAmount == 0n) return defaultSettlement;
      return {
        numTrades,
        protectionPrice,
        command: CalcCommand.SellSpecificBaseForWhateverQuote,
        minReceiveAmount: receiveSlippage(receive, slippageBips),
        quantity: {
          base_asset: baseAsset,
          base_qty: actualBaseAmount,
          quote_qty: 0n,
        },
        side: SDK.OrderSide.SELL,
        spendSlippaged: actualBaseAmount,
      };
    } else {
      let actualReceive = receiveAmount;
      let [spend, numTrades, protectionPrice, unspent] =
        SDK.getInBaseForOutQuote(
          bids,
          actualReceive,
          baseAsset,
          minMMOrderSize
            .get(tickerSpec.ticker.pair.base)!
            .get(tickerSpec.ticker.pair.quote)!,
        );

      const actualReceiveForQuote = actualReceive - unspent;
      spend += tickerSpec.rawQuoteQtyIncrement;
      [actualReceive, , ,] = SDK.getOutQuoteForInBase(
        bids,
        spend,
        baseAsset,
        minMMOrderSize
          .get(tickerSpec.ticker.pair.base)!
          .get(tickerSpec.ticker.pair.quote)!,
      );

      if (
        !bestBid ||
        actualReceive <
          getMinQtyInQuote(tickerSpec!.rawMinQuoteQty, bestBid, baseAsset)
      )
        return defaultSettlement;

      const baseSlippaged = wrapToSlippageBase(
        spend,
        slippageBips,
        tickerSpec!,
        baseAsset,
        true,
      );
      return {
        numTrades,
        command: CalcCommand.SellWhateverBaseForSpecificQuote,
        protectionPrice,
        // Some adjustment due to the requirements of min increase base qty  of 1 bips
        minReceiveAmount: (actualReceiveForQuote * 9999n) / 10000n,
        quantity: {
          base_asset: baseAsset,
          base_qty: baseSlippaged,
          quote_qty: actualReceive,
        },
        side: SDK.OrderSide.SELL,
        spendSlippaged: baseSlippaged,
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
      let actualPay = payAmount;

      let [receive, numTrades, protectionPrice, unspentPay] =
        SDK.getOutBaseForInQuote(
          asks,
          actualPay,
          baseAsset,
          minMMOrderSize
            .get(tickerSpec.ticker.pair.base)!
            .get(tickerSpec.ticker.pair.quote)!,
        );
      receive = SDK.getMatchableAmountInBase(
        0n,
        {
          base_asset: baseAsset,
          // Adjust because of ticker spec
          base_qty: (receive * 9999n) / 10000n,
          quote_qty: 0n,
        },
        tickerSpec!.rawMinQuoteQty,
        false,
      );
      actualPay = actualPay - unspentPay;
      if (
        !bestOffer ||
        actualPay <
          getMinQtyInQuote(tickerSpec!.rawMinQuoteQty, bestOffer, baseAsset)
      )
        return defaultSettlement;

      const receiveSlippaged = wrapToSlippageBase(
        receive,
        slippageBips,
        tickerSpec,
        baseAsset,
        false,
      );
      return {
        numTrades,
        protectionPrice,
        command: CalcCommand.BuyWhateverBaseForSpecificQuote,
        minReceiveAmount: receiveSlippaged,
        quantity: { base_asset: baseAsset, quote_qty: actualPay, base_qty: 0n },
        side: SDK.OrderSide.BUY,
        spendSlippaged: actualPay,
      };
    } else {
      let actualBaseAmount = SDK.getMatchableAmountInBase(
        0n,
        {
          base_asset: baseAsset,
          base_qty: receiveAmount,
          quote_qty: 0n,
        },
        tickerSpec!.rawMinQuoteQty,
        false,
      );

      const [spend, numTrades, protectionPrice, unspentReceive] =
        SDK.getInQuoteForOutBase(
          asks,
          actualBaseAmount,
          baseAsset,
          minMMOrderSize
            .get(tickerSpec.ticker.pair.base)!
            .get(tickerSpec.ticker.pair.quote)!,
        );
      actualBaseAmount -= unspentReceive;
      if (actualBaseAmount == 0n) return defaultSettlement;

      return {
        numTrades,
        protectionPrice,
        command: CalcCommand.BuySpecificBaseForWhateverQuote,
        minReceiveAmount: actualBaseAmount,
        quantity: {
          base_asset: baseAsset,
          quote_qty: spendSlippage(spend, slippageBips),
          base_qty: actualBaseAmount,
        },
        side: SDK.OrderSide.BUY,
        spendSlippaged: spendSlippage(spend, slippageBips),
      };
    }
  }
  return defaultSettlement;
}

function spendSlippage(expectedAmount: bigint, slippageBips: bigint) {
  return expectedAmount + (expectedAmount * slippageBips) / 10000n;
}

function receiveSlippage(expectedAmount: bigint, slippageBips: bigint) {
  return expectedAmount - (expectedAmount * slippageBips) / 10000n;
}

/**
 * Calculates the matchable amount in base units considering slippage for either the spend or receive side of a trade.
 * It adjusts the base quantity based on slippage in basis points (bips) and ensures the final value respects the
 * minimum quote quantity and quote quantity increment constraints from the ticker specification.
 *
 * @param {bigint} expectedBaseQty - The expected base quantity before considering slippage.
 * @param {bigint} slippageBips - The slippage in basis points (bips). 1 bip = 0.01%.
 * @param {SDK.TickerSpecification} tickerSpec - The ticker specification containing constraints for the quote quantity.
 * @param {bigint} baseAsset - The identifier for the base asset.
 * @param {boolean} isSpendSide - A boolean indicating whether the calculation is for the spend side (true) or receive side (false).
 *
 * @returns {bigint} The matchable amount in base units after adjusting for slippage.
 */
function wrapToSlippageBase(
  expectedBaseQty: bigint,
  slippageBips: bigint,
  tickerSpec: SDK.TickerSpecification,
  baseAsset: bigint,
  isSpendSide: boolean,
): bigint {
  if (expectedBaseQty == 0n) return 0n;
  const actual = SDK.getMatchableAmountInBase(
    0n,
    {
      base_asset: baseAsset,
      //it is floor so ok
      base_qty: isSpendSide
        ? spendSlippage(expectedBaseQty, slippageBips)
        : receiveSlippage(expectedBaseQty, slippageBips),
      quote_qty: 0n,
    },
    tickerSpec.rawMinQuoteQty,
    false,
    tickerSpec.rawQuoteQtyIncrement,
  );
  // neeed to floor
  if (
    !isSpendSide &&
    10000n - (10000n * actual) / expectedBaseQty > slippageBips
  )
    return actual + tickerSpec.rawQuoteQtyIncrement;
  return actual;
}

/**
 * Calculates the minimum quantity in quote units.
 *
 * @param {bigint} rawMinQuoteQty - The raw minimum quote quantity.
 * @param {bigint} bestOffer - The best offer price.
 * @param {bigint} baseAsset - The base asset quantity (default is 10^18).
 *
 * @returns {bigint} - The minimum quantity in quote units.
 */
function getMinQtyInQuote(
  rawMinQuoteQty: bigint,
  bestOffer: bigint,
  baseAsset: bigint = 10n ** 18n,
): bigint {
  return (rawMinQuoteQty * bestOffer) / baseAsset;
}
