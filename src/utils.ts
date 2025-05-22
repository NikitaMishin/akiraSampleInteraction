import { Currency } from "./types";
import {
  baseHttpApiUrl,
  coreAddress,
  CURRENCIES,
  executorAddress,
  routerAddress,
  starknetRPC,
  wssApiUrl,
} from "./constants";
import * as SDK from "layerakira-js";
import { snapshotProvider } from ".";

const FIXED_DECIMAL_PLACES = 8;

/**
 * Initialize and return an instance of the LayerAkiraSDK client.
 * @param logger
 * @param {Record<string, Currency>} [currencies=CURRENCIES] - A record of currency objects take into account different on each chain!
 * @returns {SDK.LayerAkiraSDK} - The initialized SDK client.
 */
export function spinSDKClient(
  logger: (arg: unknown) => void,
  currencies: Record<string, Currency> = CURRENCIES,
) {
  const tokenAddressMap = Object.keys(currencies).reduce((acc, key) => {
    const currency = currencies[key];
    acc[key as SDK.ERC20Token] = currency.address;
    return acc;
  }, {} as SDK.TokenAddressMap);

  const ercAddressMap = Object.keys(currencies).reduce((acc, key) => {
    const currency = currencies[key];
    acc[key as SDK.ERC20Token] = currency.unit;
    return acc;
  }, {} as SDK.ERCToDecimalsMap);

  return new SDK.LayerAkiraSDK(
    {
      apiBaseUrl: baseHttpApiUrl,
      wssPath: wssApiUrl,
      tokenMapping: tokenAddressMap,
      coreAddress: coreAddress,
      executorAddress: executorAddress,
      routerAddress: routerAddress,
      logger: logger,
      baseFeeToken: "STRK",
    },
    ercAddressMap,
    starknetRPC,
  );
}

/**
 * Convert all BigInt values in an object to strings.
 * @template T
 * @param {T} obj - The object to convert.
 * @returns {T} - The object with BigInt values converted to strings.
 */
export function convertBigIntToString<T>(obj: T): T {
  if (typeof obj === "bigint") {
    return obj.toString() as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(convertBigIntToString) as T;
  }

  if (obj !== null && typeof obj === "object") {
    const newObj: object = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // @ts-expect-error to avoid issue with serialization of bigint
        newObj[key] = convertBigIntToString(obj[key]);
      }
    }
    return newObj as T;
  }

  return obj;
}

/**
 * Converts a stringified decimal value to a BigInt with a specified number of decimals.
 *
 * @param {string} value - The stringified decimal value to convert.
 * @param {number} decimals - The number of decimals representing 1 unit (e.g., 6 for 1_000_000).
 * @returns {BigInt} The BigInt representation of the value.
 */
export function formattedDecimalToBigInt(
  value: string,
  decimals: number,
): bigint {
  // Split the value into integer and fractional parts
  const [integerPart, fractionalPart = ""] = value.split(".");

  // Pad the fractional part with trailing zeros to match the decimals
  const paddedFractionalPart = fractionalPart.padEnd(decimals, "0");

  // Combine the integer and fractional parts and convert to BigInt
  const combined = `${integerPart}${paddedFractionalPart.slice(0, decimals)}`;
  return BigInt(combined);
}

/**
 * Converts a BigInt to a decimal string with a specified number of decimals and digits after the dot.
 *
 * @param {BigInt} x - The raw BigInt value to convert.
 * @param {number} decimals - The number of decimals representing 1 unit (e.g., 6 for 1_000_000).
 * @param {number} digitsAfterDot - The number of digits to include after the decimal point.
 * @returns {string} The decimal string representation of the value.
 */
export function bigIntToFormattedDecimal(
  x: bigint,
  decimals: number,
  digitsAfterDot: number,
): string {
  const divisor = BigInt(10 ** decimals);
  const integerPart = x / divisor;
  const fractionalPart = x % divisor;

  // Extract the necessary digits after the decimal point
  let fractionalStr = fractionalPart
    .toString()
    .padStart(decimals, "0")
    .slice(0, digitsAfterDot);
  // Remove trailing zeros from the fractional part
  fractionalStr = fractionalStr.replace(/0+$/, "");
  // Combine the integer part and the formatted fractional part
  return fractionalStr
    ? `${integerPart.toString()}.${fractionalStr}`
    : integerPart.toString();
}

/**
 * Pads the output string with leading zeros to match the length of the original input.
 * @param {string} output - The output string to pad.
 * @param {string} original - The original input string for reference.
 * @returns {string} - The padded output string.
 */
const padOutput = (output: string, original: string) => {
  const originalParts = original.split(".");
  const outputParts = output.split(".");

  const paddedIntPart = outputParts[0].padStart(originalParts[0].length, "0");

  let paddedFractionPart = "";
  if (originalParts.length > 1) {
    paddedFractionPart =
      outputParts.length > 1
        ? outputParts[1].padEnd(originalParts[1].length, "0")
        : "".padEnd(originalParts[1].length, "0");
  }

  return originalParts.length > 1
    ? `${paddedIntPart}.${paddedFractionPart}`
    : paddedIntPart;
};

/**
 * Truncates the decimal part of a number to a fixed number of decimal places.
 *
 * @param {string} value - The value to truncate.
 * @returns {string} - Value with truncated decimals.
 */
export const truncateDecimals = (value: string, decimals?: number) => {
  // Check if the value contains a decimal point
  const decimalIndex = value.indexOf(".");
  const decimal = decimals || FIXED_DECIMAL_PLACES;

  if (decimalIndex !== -1) {
    // Split the value into integer and decimal parts
    const integerPart = value.substring(0, decimalIndex);
    let decimalPart = value.substring(decimalIndex + 1);

    // Truncate decimal part to maximum six digits
    if (decimalPart.length > decimal) {
      decimalPart = decimalPart.substring(0, decimal);
    }

    // Return the truncated value
    return integerPart + "." + decimalPart;
  }

  // If there's no decimal point, return the original value
  return value;
};

/**
 * Cleans the base amount according to the ticker specification and market levels.
 * @param {Object} params - The parameters for cleaning the base amount.
 * @param {string} params.value - The input value as a string.
 * @param {number} params.decimals - The number of decimals for the base asset.
 * @param { [bigint, bigint, number][] } params.levels - The market levels (bids or asks).
 * @param {SDK.TickerSpecification} params.spec - The ticker specification.
 * @param {number} [params.digitsAfterDot=10] - The number of digits after the decimal point to display
 * @returns {string} - The cleaned base amount as a string.
 */
export function cleanBaseAmount({
  value,
  decimals,
  spec,
  digitsAfterDot = 10,
}: {
  value: string;
  decimals: number;
  levels: [bigint, bigint, number][];
  spec: SDK.TickerSpecification;
  digitsAfterDot?: number;
}): string {
  const baseAsset = 10n ** BigInt(decimals);
  const fmtAmount = formattedDecimalToBigInt(value, decimals);
  if (fmtAmount == 0n) {
    return truncateDecimals(value);
  }

  let matchableAmount = SDK.getMatchableAmountInBase(
    0n,
    {
      base_asset: baseAsset,
      base_qty: fmtAmount,
      quote_qty: 0n,
    },
    spec.rawMinQuoteQty,
    false,
    spec.rawQuoteQtyIncrement,
  );
  console.log("matchable", matchableAmount);
  if (matchableAmount <= 0n) matchableAmount = spec!.rawMinQuoteQty;
  return padOutput(
    bigIntToFormattedDecimal(matchableAmount, decimals, digitsAfterDot),
    value,
  );
}

/**
 * Cleans the quote amount according to the market levels.
 * @param {Object} params - The parameters for cleaning the quote amount.
 * @param {string} params.value - The input value as a string.
 * @param {number} params.decimals - The number of decimals for the quote asset.
 * @returns {string} - The cleaned quote amount as a string.
 */
export function cleanQuoteAmount({
  value,
  decimals,
}: {
  value: string;
  decimals: number;
  levels: [bigint, bigint, number][];
  digitsAfterDot?: number;
}): string {
  const fmtAmount = formattedDecimalToBigInt(value, decimals);
  if (fmtAmount == 0n) {
    return truncateDecimals(value);
  }
  return value;
}

export function getTickerSpec(
  externalFunds: boolean,
  payCurrency: SDK.ERC20Token | undefined,
  receiveCurrency: SDK.ERC20Token | undefined,
  tickerSpec: SDK.TickerSpecification[] | undefined,
): SDK.TickerSpecification | undefined {
  if (!payCurrency || !receiveCurrency) return undefined;

  const fstTicker = snapshotProvider
    .getSnapshotPath(payCurrency, receiveCurrency)
    .value!.at(0)!.ticker;
  const spec = tickerSpec?.find(
    (o) =>
      // TODO: externalFunds bit odd flag
      // !externalFunds === o.ticker.isEcosystemBook &&
      (o.ticker.pair.base === fstTicker.base &&
        o.ticker.pair.quote === fstTicker.quote) ||
      (o.ticker.pair.base === fstTicker.quote &&
        o.ticker.pair.quote === fstTicker.base),
  );
  return spec;
}
