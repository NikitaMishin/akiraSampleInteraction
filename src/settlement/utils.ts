import { bigIntToFormattedDecimal } from "../utils";
import * as SDK from "layerakira-js";

const hundredPercents = 1_000_000n;

export const calcPostFeeReceive = (
  actualReceive: bigint,
  chargableBipsFee: number,
) =>
  ((hundredPercents - BigInt(chargableBipsFee)) * actualReceive) /
  hundredPercents;

export const getRate = (
  actualPay: bigint,
  receivePostFee: bigint,
  payDecimals: number,
  receiveDecimals: number,
) => {
  return bigIntToFormattedDecimal(
    (10n ** BigInt(receiveDecimals) * actualPay) / receivePostFee,
    payDecimals,
    10,
  );
};

export function spendSlippage(expectedAmount: bigint, slippageBips: bigint) {
  return expectedAmount + (expectedAmount * slippageBips) / 10000n;
}

export function receiveSlippage(expectedAmount: bigint, slippageBips: bigint) {
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
export function wrapToSlippageBase(
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
export function getMinQtyInQuote(
  rawMinQuoteQty: bigint,
  bestOffer: bigint,
  baseAsset: bigint = 10n ** 18n,
): bigint {
  return (rawMinQuoteQty * bestOffer) / baseAsset;
}
