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
 * Cleans the base (<BASE>/<QUOTE> ticker) amount according to the ticker specification
 * @param {Object} params - The parameters for cleaning the base amount.
 * @param {string} params.value - The input value as a string.
 * @param {number} params.decimals - The number of decimals for the base asset.
 * @param {SDK.TickerSpecification} params.spec - The ticker specification.
 */
export function cleanBaseAmount({
  value,
  decimals,
  spec,
}: {
  value: bigint;
  decimals: number;
  spec: SDK.TickerSpecification;
}): bigint {
  let matchableAmount = SDK.getMatchableAmountInBase(
    0n,
    {
      base_asset: 10n ** BigInt(decimals),
      base_qty: value,
      quote_qty: 0n,
    },
    spec.rawMinQuoteQty,
    false,
    spec.rawQuoteQtyIncrement,
  );
  if (matchableAmount <= 0n) matchableAmount = spec!.rawMinQuoteQty;
  return matchableAmount;
}
