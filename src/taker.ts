import {
  baseTradeAddress,
  CHAIN_ID,
  coreAddress,
  coreContract,
  CURRENCIES,
  executorContract,
  rollupInvoker,
  routerSigner,
  snip9Address,
  snip9Contract,
} from "./constants";
import { Currency } from "./types";
import * as SDK from "layerakira-js";
import { getTickerSpec } from "./utils";
import { queryGasRelated } from "./lib";
import { Account, OutsideExecutionVersion } from "starknet";
import { calcOrderHashAndTypedData, signOrder } from "./signer";
import { getSnapshot } from "./snapshot";
import { estimateSettlementComplex } from "./settlement";
import { CalcCommand, Settlement } from "./settlement/model";
import { SOR_PATH } from "./sorPath";

/**
 * Capable of building and signing simple router order and sor order based on the snapshot path provided by the provider
 */
export class TakerCli {
  private tokenDecimals: SDK.ERCToDecimalsMap;
  private orderBuilder: SDK.OrderConstructor;
  private logger: (arg: unknown) => void;

  constructor(
    orderBuilder: SDK.OrderConstructor,
    logger: (arg: unknown) => void,
    currencies: Record<string, Currency> = CURRENCIES,
  ) {
    this.orderBuilder = orderBuilder;
    this.tokenDecimals = Object.keys(currencies).reduce((acc, key) => {
      const currency = currencies[key];
      acc[key as SDK.ERC20Token] = currency.unit;
      return acc;
    }, {} as SDK.ERCToDecimalsMap);
    this.logger = logger;
  }

  public listSorPaths() {
    this.logger(`Example SOR paths: \n Name: Description`);
    SOR_PATH.forEach((path, key) => {
      this.logger(`${key}: ${path.description}`);
    });
  }

  private buildOrder(
    settlement: Settlement,
    trader: SDK.Address,
    clientNonce: number,
    payCurrency: Currency,
    receiveCurrency: Currency,
    externalFunds: boolean,
    gasPrice: bigint,
    gasConversionRate: [bigint, bigint],
    gasTokenCurrency: Currency,
    tickerSpecs: SDK.TickerSpecification[],
    isSor: boolean,
    snip9: boolean,
  ): SDK.Order {
    let signScheme =
      (snip9 && externalFunds) || isSor
        ? SDK.SignScheme.DIRECT
        : SDK.SignScheme.ACCOUNT;
    const gasPriceSkewed = (100n * gasPrice!) / 100n;

    const fstSettle = settlement?.subSettlements?.at(0) ?? settlement;
    const fstPair = fstSettle.context!.getExchangeTicker(0)!.pair;
    const spec = getTickerSpec(
      externalFunds,
      payCurrency.code,
      receiveCurrency.code,
      tickerSpecs,
    );
    const priceTick = spec?.rawPriceIncrement!;
    const protectionPrice =
      ((fstSettle.side == SDK.OrderSide.BUY
        ? (fstSettle.protectionPrice * 120n) / 100n
        : (fstSettle.protectionPrice * 80n) / 100n) /
        priceTick) *
      priceTick;

    if (settlement.context?.countBooks() == 1) {
      const order = this.orderBuilder!.buildSimpleRouterSwap(
        fstPair,
        protectionPrice,
        fstSettle.quantity,
        settlement.numTrades,
        fstSettle.side,
        gasPriceSkewed,
        externalFunds,
        fstSettle.minReceiveAmount,
        gasTokenCurrency.code,
        gasConversionRate,
        undefined,
        clientNonce,
        signScheme,
        trader,
      );
      if (order.constraints.min_receive_amount != 0n) {
        const gasFee = order.fee.gas_fee;
        // TODO parameterize STRK base token
        const [amount, token] = SDK.getGasFeeAndCoin(
          gasFee,
          gasFee.max_gas_price,
          "STRK",
          gasFee.gas_per_action,
        );
        if (
          token ==
          (order.flags.is_sell_side ? order.ticker.quote : order.ticker.base)
        ) {
          order.constraints.min_receive_amount -=
            amount * BigInt(order.constraints.number_of_swaps_allowed);
        }
        return order;
      }
      return order;
    }

    const lastSettle = settlement.subSettlements!.at(
      settlement.subSettlements!.length - 1,
    )!;
    const isExactSell =
      settlement.command == CalcCommand.SellSpecificBaseForWhateverQuote ||
      settlement.command == CalcCommand.BuyWhateverBaseForSpecificQuote;

    const qty = isExactSell
      ? fstSettle.quantity
      : {
          base_asset: fstSettle.quantity.base_asset,
          base_qty:
            fstSettle.side == SDK.OrderSide.SELL
              ? settlement.spendSlippaged
              : 0n,
          quote_qty:
            fstSettle.side != SDK.OrderSide.SELL
              ? settlement.spendSlippaged
              : 0n,
        };

    let order = this.orderBuilder.buildSORRouterSwap(
      settlement.subSettlements!.slice(1)!.map((e) => {
        const pair = e!.context?.getExchangeTicker(0)!.pair!;
        const is_sell_side = e.side == SDK.OrderSide.SELL;
        return {
          price: is_sell_side ? 0n : 10n ** 32n,
          ticker: pair,
          is_sell_side,
          base_asset:
            10n **
            BigInt(
              is_sell_side
                ? e.context?.spendTokenDecimals(0)!
                : e.context?.receiveTokenDecimals(0)!,
            ),
        };
      }),
      fstPair,
      protectionPrice,
      qty,
      settlement.numTrades,
      fstSettle.side,
      gasPriceSkewed,
      externalFunds,
      isExactSell ? settlement.receiveSlippaged : 0n,
      gasTokenCurrency.code,
      gasConversionRate,
      undefined,
      clientNonce,
      signScheme,
      trader,
      !isExactSell
        ? lastSettle.quantity
        : {
            base_qty: 0n,
            quote_qty: 0n,
            base_asset: lastSettle.quantity.base_asset,
          },
      isExactSell ? 0n : settlement.spendSlippaged,
      true, //TODO
      false,
    );
    const gasFee = order.fee.gas_fee;
    let [amount, _] = SDK.getGasFeeAndCoin(
      gasFee,
      gasFee.max_gas_price,
      "STRK",
      gasFee.gas_per_action,
    );
    amount *= BigInt(order.constraints.number_of_swaps_allowed);
    console.log("Amount:", amount, order.sor!.min_receive_amount);
    const lastCtx = lastSettle.context!;
    if (isExactSell && order.sor!.min_receive_amount != 0n) {
      if (
        gasTokenCurrency.code ==
        (lastCtx.isSellSide(0) ? lastCtx.pair!.quote : lastCtx.pair!.base)
      )
        order.sor!.min_receive_amount! -= amount;
    }
    if (!isExactSell && order.sor!.max_spend_amount != 0n) {
      console.log("AmountMaxSpend:", order.sor!.max_spend_amount! + amount);

      if (
        gasTokenCurrency.code ==
        (order.flags.is_sell_side ? fstPair.base : fstPair.quote)
      ) {
        order.sor!.max_spend_amount! += amount;
        if (gasTokenCurrency.code == fstPair.base) {
          order.qty.base_qty += SDK.getMatchableAmountInBase(
            0n,
            {
              base_qty: amount + spec!.rawMinQuoteQty - 1n,
              quote_qty: 0n,
              base_asset: qty.base_asset,
            },
            spec!.rawMinQuoteQty,
            false,
            spec!.rawQuoteQtyIncrement,
          );
        } else {
          order.qty.quote_qty += amount;
        }
      }
    }

    return order;
  }

  public async placeTakerOrder(
    routerSDK: SDK.LayerAkiraSDK,
    payCurrency: Currency,
    receiveCurrency: Currency,
    gasTokenCurrency: Currency,
    payAmount: string,
    receiveAmount: string,
    lastUpdatedField: "pay" | "receive",
    tickerSpecs: SDK.TickerSpecification[],
    clientAccount: Account,
    clientNonce: number,
    snip9: boolean = true,
    externalFunds: boolean = true,
    useNativeRouter: boolean = true,
    slippageBips: number = 100,
  ): Promise<string> {
    let [gasPrice, gasConversionRate] = await queryGasRelated(
      routerSDK,
      gasTokenCurrency.code,
    );

    const snapshott = await getSnapshot({
      payCurrency,
      receiveCurrency,
      routerSDK,
      tickerSpecs,
      levels: 10,
      decimals: this.tokenDecimals,
      externalFunds: true,
    });

    const routerSpec = await routerSDK.akiraHttp.queryRouterSpecification();

    const settlement = estimateSettlementComplex({
      snapshott,
      payAmount,
      receiveAmount,
      lastUpdatedField,
      exchangeFee: 0,
      slippageBips: BigInt(slippageBips),
      routerTakerPbips: routerSpec.result?.routerTakerPbips!,
      tickerSpecs,
    });

    const sor =
      settlement.subSettlements !== undefined &&
      settlement.subSettlements.length > 0;

    const order = this.buildOrder(
      settlement,
      clientAccount.address,
      clientNonce,
      payCurrency,
      receiveCurrency,
      externalFunds,
      gasPrice,
      gasConversionRate,
      gasTokenCurrency,
      tickerSpecs,
      sor,
      snip9,
    );

    return await this.signAndPlaceOrder(
      order,
      settlement,
      payCurrency,
      receiveCurrency,
      clientAccount,
      routerSDK,
      gasTokenCurrency,
      gasPrice,
      externalFunds,
      snip9,
      useNativeRouter,
      sor,
    );
  }

  private async signAndPlaceOrder(
    order: SDK.Order,
    settlement: Settlement,
    payCurrency: Currency,
    receiveCurrency: Currency,
    clientAccount: Account,
    routerSDK: SDK.LayerAkiraSDK,
    gasTokenCurrency: Currency,
    gasPrice: bigint,
    externalFunds: boolean,
    snip9: boolean,
    useNativeRouter: boolean,
    sor: boolean,
  ): Promise<string> {
    let sign: SDK.TraderSignature = ["0x0", "0x0"];

    let routerSignatureResult: SDK.Result<[string, string]>;

    const [orderHash, orderTypedData] = calcOrderHashAndTypedData(
      clientAccount!,
      order,
      `${CHAIN_ID}`,
    );
    if (useNativeRouter) {
      // use layerakira router
      routerSignatureResult =
        await routerSDK?.akiraHttp.signExternalOrder(order);
    } else {
      // use your own router; dont forget to perform necessary preparations
      routerSignatureResult = {
        result: SDK.castToApiSignature(
          await routerSigner.signRaw(orderHash),
        ) as [string, string],
      };
    }

    if ((snip9 && externalFunds) || sor) {
      // here we are building snip9 order
      // a bit more just to avoid any problem with rounding
      const gasFee = order.fee.gas_fee;
      const requiredApproveToSpend = (105n * settlement.spendSlippaged) / 100n;
      // make some premium
      const totalGas =
        BigInt(order.constraints.number_of_swaps_allowed) *
        SDK.getGasFeeAndCoin(gasFee, (gasPrice * 105n) / 100n, "STRK", 250)[0];

      const approvals: [[SDK.ERC20Token, bigint, SDK.Address]] = [
        [payCurrency.code as string, requiredApproveToSpend, baseTradeAddress],
      ];
      if (
        gasTokenCurrency.code != payCurrency.code &&
        gasTokenCurrency.code != receiveCurrency.code
      ) {
        approvals.push([gasFee.fee_token, totalGas, baseTradeAddress]);
      }
      // check if client already approved executor
      const is_approved_executor = await coreContract.call(
        "is_approved_executor",
        [baseTradeAddress, clientAccount.address.toString()],
      );
      const is_approved_snip9 = await executorContract.call(
        "is_approved_executor",
        [snip9Address, clientAccount.address.toString()],
      );

      const executorApprovals: [SDK.Address, SDK.Address][] = [];
      if (!is_approved_executor)
        executorApprovals.push([coreAddress, baseTradeAddress]);
      if (!is_approved_snip9)
        executorApprovals.push([baseTradeAddress, snip9Address]);

      let execOutsidePrimitives;
      if (!order.sor) {
        execOutsidePrimitives = SDK.buildExecuteOutsidePrimitives(
          snip9Contract,
          order,
          Object.fromEntries(
            Object.entries(CURRENCIES).map(([key, currency]) => [
              key,
              currency.address,
            ]),
          ),
          routerSignatureResult!.result!,
          approvals,
          rollupInvoker,
          undefined,
          undefined,
          executorApprovals,
        );
      } else {
        execOutsidePrimitives = SDK.buildExecuteOutsideSORPrimitives(
          snip9Contract,
          order,
          Object.fromEntries(
            Object.entries(CURRENCIES).map(([key, currency]) => [
              key,
              currency.address,
            ]),
          ),
          routerSignatureResult.result!,
          approvals,
          rollupInvoker,
          undefined,
          undefined,
          executorApprovals,
        );
      }
      // normally you need check what snip0 revision is supported
      order.snip9_call = await SDK.buildOutsideExecuteTransaction(
        //@ts-ignore
        clientAccount!,
        execOutsidePrimitives[0],
        execOutsidePrimitives[1],
        execOutsidePrimitives[2],
        OutsideExecutionVersion.V2,
      );
    } else {
      sign = await signOrder(clientAccount, orderTypedData);
    }

    let result: SDK.Result<string> = await routerSDK!.akiraHttp.placeOrder(
      order,
      sign,
      routerSignatureResult.result,
    );

    // if order passes basic checks -> http would return hash of the order
    // otherwise error would be returned
    if (result.result == undefined) {
      console.warn(`Failed to submit order due ${JSON.stringify(result)}`);
      return "";
    }
    return result.result!;
  }
}
