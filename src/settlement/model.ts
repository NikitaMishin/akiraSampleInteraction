import * as SDK from "layerakira-js";
import { OrderSide } from "layerakira-js";
import { ISnapshotInfoPath } from "../snapshot/config";

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
  amountIn: bigint; // Amount of the input asset
  amountOut: bigint; // Amount of the output asset
  rateStringify: string; // String representation of the rate
  protectionPrice: bigint; // Protection price for the settlement
  receivePostFee: bigint; // Amount received after fees
  minReceiveAmount: bigint; // Minimum amount to receive considering slippage
  quantity: SDK.Quantity; // Quantity details for building order

  // slippagedProtectionPrice: bigint; // Protection price after considering slippage
  side: SDK.OrderSide; // Side of the order (buy or sell)
  command: CalcCommand | undefined; // Calculation command used
  spendSlippaged: bigint;
  receiveSlippaged: bigint;
  priceImpactBips: number;
  context: ISnapshotInfoPath | undefined;
  subSettlements?: Settlement[];
}

export const defaultSettlement: Settlement = {
  numTrades: 0,
  amountIn: 0n,
  amountOut: 0n,
  rateStringify: "",
  protectionPrice: 0n,
  receivePostFee: 0n,
  minReceiveAmount: 0n,
  quantity: { base_asset: 0n, quote_qty: 0n, base_qty: 0n },
  // slippagedProtectionPrice: 0n,
  command: undefined,
  side: OrderSide.SELL,
  spendSlippaged: 0n,
  receiveSlippaged: 0n,
  priceImpactBips: 0,
  context: undefined,
};
