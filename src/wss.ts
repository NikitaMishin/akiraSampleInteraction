import {
  ExecutionReport,
  LayerAkiraSDK,
  MatchingEngineResult,
  OrderStatus,
  SocketEvent,
} from "layerakira-js";
import { bigIntReplacer } from "layerakira-js/dist/api/http/utils";

/**
 * Enum representing the status of an order.
 */
export enum Status {
  Pending = "Pending", // Order sent to exchange and being processed; for taker orders means awaiting to be mined in rollup
  Executed = "Executed", // Order successfully executed onchain
  Failed = "Failed", // Order failed to execute
  Unhandled = "Unhandled",
}

/**
 * Determines the status of a taker order based on the execution report.
 *
 * @param {ExecutionReport} evt - The execution report containing order status and matcher results.
 * @returns {[Status, string]} A tuple containing the determined status and a descriptive message.
 */
export const getTakerOrderStatus = (evt: ExecutionReport): [Status, string] => {
  let status = Status.Unhandled;
  let handled = false;
  switch (evt.status) {
    case OrderStatus.PARTIALLY_FILLED:
    case OrderStatus.FILLED:
    case OrderStatus.CLOSED:
      return [Status.Pending, "Sending transaction onchain"];
    // only happens if taker start to do malicious actions; or router; would come after Status.Pending
    case OrderStatus.FAILED_ROLLUP:
      return [Status.Failed, "Failed rollup"];
    case OrderStatus.EXPIRED: // not relevant for takers in current setup (relative to mm and for stp modes)
      return [Status.Failed, "Expired"];
    default:
      console.log(`Switch first not handled ${evt.matcher_result}`);
      handled = false;
      break;
  }
  if (!handled) {
    switch (evt.matcher_result) {
      case MatchingEngineResult.OK:
        break; // already handled
      case MatchingEngineResult.MIN_RECEIVE_FAILED: //offchain slippage hit "min_received field"
        return [Status.Failed, "Slippage hit"];
      case MatchingEngineResult.HIT_SWAPS_LIMIT: // more trades produced than allowed by taker in field ...num_swaps_allowed...
      case MatchingEngineResult.NOT_ENOUGH_LIQUIDITY: // not enough liquidity in book to fulfill client request
      case MatchingEngineResult.SLIPPAGE: // slippage triggered by protection price
      // order became invalid due stp or because it is expired (only makes sense to market makers since takers executed instantly) by time
      case MatchingEngineResult.EXPIRED:
      //  gas cost higher than trade result; client unable to cover gas by the amount he would receive
      case MatchingEngineResult.GAS_COST:
      //  deep validation of order was unsuccessful
      case MatchingEngineResult.FAILED_VALIDATION:
        let [status, description] = [Status.Failed, ""];
        if (MatchingEngineResult.HIT_SWAPS_LIMIT === evt.matcher_result) {
          description = "Hit swaps limit";
        } else if (
          MatchingEngineResult.NOT_ENOUGH_LIQUIDITY == evt.matcher_result
        ) {
          description = "Not enough liquidity";
        } else if (MatchingEngineResult.GAS_COST === evt.matcher_result) {
          description = "Gas cost higher than received amount";
        } else if (MatchingEngineResult.EXPIRED === evt.matcher_result) {
          description = "Expired";
        } else if (
          MatchingEngineResult.FAILED_VALIDATION === evt.matcher_result
        ) {
          description = "Validation error";
        }
        return [status, description];
    }
  }
  // note open,cancelled
  return [status, ""];
};

/**
 * Subscribes to execution reports with retry logic if subscription fails.
 * handleExecReport: handles exec reports sent over wss
 * stopped: handles if reconnect should occur once disconnection is fired
 */
export const subscribeToExecutionReports = async (
  sdk: LayerAkiraSDK,
  handleExecReport: (evt: ExecutionReport) => void,
  stopped: () => boolean,
  retryDelay = 5000,
) => {
  try {
    const res = await sdk.akiraWss.subscribeOnExecReport(async (e) => {
      if (e === SocketEvent.DISCONNECT) {
        sdk.akiraHttp.logger(
          "WebSocket disconnected. Attempting to resubscribe...",
        );
        await subscribeToExecutionReports(
          sdk,
          handleExecReport,
          stopped,
          retryDelay,
        );
      } else {
        handleExecReport(e);
      }
    });
    if (!res.result) {
      console.warn(`failed to sub due ${JSON.stringify(res, bigIntReplacer)}`);
      throw Error("Failed to sub");
    }
    sdk.akiraHttp.logger(
      `Successfully subscribed to execution reports ${JSON.stringify(res, bigIntReplacer)}`,
    );
  } catch (error) {
    sdk.akiraHttp.logger(
      `Failed to subscribe to execution reports: ${error}. Retrying in ${retryDelay}ms...`,
    );
    if (!stopped()) {
      // Retry subscription after a delay if not stopped
      setTimeout(
        () =>
          subscribeToExecutionReports(
            sdk,
            handleExecReport,
            stopped,
            retryDelay,
          ),
        retryDelay,
      );
    }
  }
};
