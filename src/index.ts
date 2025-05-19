import { formattedDecimalToBigInt, spinSDKClient } from "./utils";
import { authenticateAccount } from "./auth";
import { Account, OutsideExecutionVersion, Signer } from "starknet";
import {
  CHAIN_ID,
  coreAddress,
  coreContract,
  CURRENCIES,
  executorAddress,
  executorContract,
  rollupInvoker,
  routerAccount,
  routerSigner,
  rpcProvider,
} from "./constants";
import readline from "node:readline";
import {
  castToApiSignature,
  ExecutionReport,
  OrderConstructor,
  Result,
  TickerSpecification,
  TraderSignature,
} from "layerakira-js";
import { getTakerOrderStatus, subscribeToExecutionReports } from "./wss";
import { initializeOrderBuilder } from "./builder";
import { calcOrderHashAndTypedData, signOrder } from "./signer";
import { buildSwapOrder, queryGasRelated, queryTransactionHash } from "./swap";
import { Currency } from "./types";
import * as SDK from "layerakira-js";
import { bigIntReplacer } from "layerakira-js/dist/api/http/utils";
import { ERC20Token } from "layerakira-js/src/request_types";
import { SorTaker } from "./sor";
import {
  fetchTickerSnapshots,
  SnapshotPathProvider,
} from "./snapshot/PathProvider";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

export const routerSDK = spinSDKClient((arg: any) => console.log(arg));

let orderBuilder: OrderConstructor;
let tickerSpec: Array<TickerSpecification>;
let sorTaker: SorTaker;
export let snapshotProvider: SnapshotPathProvider<SDK.Snapshot>;

const setupRouterSDK = async (
  execReportHandler: (report: ExecutionReport) => void,
  stopped: () => boolean = () => false,
) => {
  const jwtToken = await authenticateAccount(routerSDK, routerAccount);
  routerSDK.akiraHttp.setCredentials(
    jwtToken,
    routerAccount.address,
    await routerAccount.signer.getPubKey(),
  );
  if (routerSDK.akiraHttp.getSigner() === undefined)
    throw Error("SDK client not initialized properly. Please setCredentials");
  routerSDK.akiraWss.connect(); // no need to wait cause loop with disconnection logic
  await subscribeToExecutionReports(routerSDK, execReportHandler, stopped);
  // await sleep(5000)
  tickerSpec = (
    await routerSDK.akiraHttp.queryTickerSpecification()
  ).result!.filter((e) => !e.ticker.isEcosystemBook);
  orderBuilder = await initializeOrderBuilder(routerSDK);
};

const setUpSorTaker = async () => {
  // making sure that put necessary tokens in the snapshot path provider for sor snapshots
  const tokens = new Set<string>();
  for (const ticker of tickerSpec) {
    tokens.add(ticker.ticker.pair.base);
    tokens.add(ticker.ticker.pair.quote);
  }
  snapshotProvider = new SnapshotPathProvider<SDK.Snapshot>(
    Array.from(tokens),
    4,
  );
  await fetchTickerSnapshots(routerSDK, tickerSpec);
  sorTaker = new SorTaker(orderBuilder, console.log);
};

setupRouterSDK((e) =>
  console.log(
    `Parsed evt: ${getTakerOrderStatus(e)}\n : ${JSON.stringify(e, bigIntReplacer)}`,
  ),
).then(() => {
  setUpSorTaker();
});

const swapPipeline = async (
  payCurrency: Currency,
  receiveCurrency: Currency,
  gasTokenCurrency: Currency,
  lastUpdatedField: "pay" | "receive",
  payAmount: bigint,
  receiveAmount: bigint,
  slippageBips: number = 100,
  snip9: boolean = true,
  feeBipsTotal: number = 10_00,
  useNativeRouter = true,
): Promise<string> => {
  let [gasPrice, gasConversionRate] = await queryGasRelated(
    routerSDK,
    gasTokenCurrency.code,
  );

  //Let's assume client call from your frontend "build" method
  //below part of build method
  const [order, spendSlippaged] = await buildSwapOrder(
    clientAccount.address,
    clientNonce,
    routerSDK,
    orderBuilder,
    tickerSpec,
    payCurrency,
    receiveCurrency,
    gasTokenCurrency,
    gasPrice,
    gasConversionRate,
    lastUpdatedField,
    payAmount,
    receiveAmount,
    slippageBips,
    snip9,
    feeBipsTotal,
  );
  const [orderHash, orderTypedData] = calcOrderHashAndTypedData(
    clientAccount!,
    order,
    `${CHAIN_ID}`,
  );
  let routerSignatureResult: Result<[string, string]>;

  if (useNativeRouter) {
    // use layerakira router
    routerSignatureResult = await routerSDK?.akiraHttp.signExternalOrder(order);
  } else {
    // use your own router; dont forget to perform necessary preparations
    routerSignatureResult = {
      result: castToApiSignature(await routerSigner.signRaw(orderHash)) as [
        string,
        string,
      ],
    };
  }
  // at this stage we properly built order
  // assume it is end of "build"  endpoint

  if (snip9) {
    // here we are building snip9 order
    // a bit more just to avoid any problem with rounding
    const requiredApproveToSpend = (105n * spendSlippaged) / 100n;
    const gasFee = order.fee.gas_fee;
    // make some premium
    const totalGas =
      BigInt(order.constraints.number_of_swaps_allowed) *
      SDK.getGasFeeAndCoin(gasFee, (gasPrice * 105n) / 100n, "STRK", 250)[0];

    const approvals: [[ERC20Token, bigint, string]] = [
      [payCurrency.code as string, requiredApproveToSpend, executorAddress],
    ];
    if (
      gasTokenCurrency.code != payCurrency.code &&
      gasTokenCurrency.code != receiveCurrency.code
    ) {
      approvals.push([gasFee.fee_token, totalGas, executorAddress]);
    }
    // check if client already approved executor
    const is_approved_executor = await coreContract.call(
      "is_approved_executor",
      [clientAccount.address.toString()],
    );
    // dont forget in real code to check snip9 version that supported by wallet of user
    const execOutsidePrimitives = SDK.buildExecuteOutsidePrimitives(
      executorContract,
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
      //@ts-ignore
      !is_approved_executor,
    );
    // normally you need check what snip0 revision is supported
    order.snip9_call = await SDK.buildOutsideExecuteTransaction(
      //@ts-ignore
      clientAccount!,
      execOutsidePrimitives[0],
      execOutsidePrimitives[1],
      execOutsidePrimitives[2],
      OutsideExecutionVersion.V2,
    );
  }
  // at this stage we properly built order
  // assume it is end of "build" endpoint

  // this is client phase, on frontend where he signs and submits to either layerakira or your relayer backend
  let sign: TraderSignature = ["0x0", "0x0"];
  let result: SDK.Result<string>;
  if (!snip9) {
    sign = await signOrder(clientAccount!, orderTypedData);
    result = await routerSDK!.akiraHttp.placeOrder(
      order,
      sign,
      routerSignatureResult.result,
    );
  } else {
    result = await routerSDK!.akiraHttp.placeOrder(
      order,
      sign,
      routerSignatureResult.result,
    );
  }
  // if order passes basic checks -> http would return hash of the order
  // otherwise error would be returned
  if (result.result == undefined) {
    console.warn(`Failed to submit order due ${JSON.stringify(result)}`);
    return "";
  }
  return result.result!;
};

let clientAccount: Account;
let clientNonce = 0;

rl.on("line", (line: string) => {
  line = line.trim();
  if (line.startsWith("setTester")) {
    //setTester <account> <private key>
    let [_, account, pk, nonce] = line.split(" ");
    clientAccount = new Account(rpcProvider, account, new Signer(pk));
    clientNonce = parseInt(nonce);
  }

  // List all the avaiable sor paths for this cli
  if (line.startsWith("list_sor_path")) {
    sorTaker.listSorPaths();
  }

  // samples:
  // place_sor STRK 1 AETH 0.147 10 STRK true true
  // place_sor STRK 1 AUSDT 0.147 10 STRK true true
  // place_sor AAAVE 1 AETH 0.147 10 AETH true true
  if (line.startsWith("place_sor")) {
    let [
      _,
      payCode,
      payAmount,
      receiveCode,
      receiveAmount,
      slippageBips,
      gasTokenCode,
      useNativeRouter,
      externalFunds,
    ] = line.split(" ");
    const [payCurrency, receiveCurrency, gasCurrency] = [
      CURRENCIES[payCode],
      CURRENCIES[receiveCode],
      CURRENCIES[gasTokenCode],
    ];
    let tweakedField: "pay" | "receive" =
      formattedDecimalToBigInt(payAmount, payCurrency.unit) > 0n
        ? "pay"
        : "receive";
    const nativeRouter = useNativeRouter.trim().toLowerCase() == "true";
    sorTaker
      .placeSorOrder(
        routerSDK,
        payCurrency,
        receiveCurrency,
        gasCurrency,
        payAmount,
        receiveAmount,
        tweakedField,
        tickerSpec,
        clientAccount,
        clientNonce,
        externalFunds.trim().toLowerCase() == "true",
        nativeRouter,
        parseInt(slippageBips),
      )
      .then((hash) => {
        console.log(`Order hash: ${hash}`);
      });
  }

  // samples:
  // swap AETH 0.1 AUSDC 0 10 AETH true true
  // swap AUSDC 50 AUSDC 0 10 AETH true true
  // swap AUSDC 0 AETH 0.01 10 AETH true true
  // swap AUSDC 5 AETH 0 10 AUSDC true true
  // fee token in this example always set to receive currency
  // <payField> <payAmount> <receiveField> <receiveAmount> <slippageBips> <gasToken> <enablesnip9> <useNativeRouter>
  if (line.startsWith("swap")) {
    let [
      _,
      payCode,
      payAmount,
      receiveCode,
      receiveAmount,
      slippageBips,
      gasTokenCode,
      snip9,
      useNativeRouter,
    ] = line.split(" ");
    const [payCurrency, receiveCurrency, gasCurrency] = [
      CURRENCIES[payCode],
      CURRENCIES[receiveCode],
      CURRENCIES[gasTokenCode],
    ];
    console.log(gasCurrency, gasTokenCode);
    const isSnip9 = snip9.trim().toLowerCase() == "true";
    const nativeRouter = useNativeRouter.trim().toLowerCase() == "true";
    const payAmountRaw = formattedDecimalToBigInt(payAmount, payCurrency.unit);
    const receiveAmountRaw = formattedDecimalToBigInt(
      receiveAmount,
      receiveCurrency.unit,
    );
    let tweakedField: "pay" | "receive" = payAmountRaw > 0n ? "pay" : "receive";
    swapPipeline(
      payCurrency,
      receiveCurrency,
      gasCurrency,
      tweakedField,
      payAmountRaw,
      receiveAmountRaw,
      parseInt(slippageBips),
      isSnip9,
      10_00,
      nativeRouter,
    ).then((orderHash) => console.log(`Order hash: ${orderHash}`));
  }

  // allows one to query order by its order hash
  if (line.startsWith("getOrder")) {
    // getOrder <orderhash>
    let [_, orderHash] = line.split(" ");
    // note that router can query client orders iff in order this signer is set to account
    routerSDK.akiraHttp
      .getOrder(clientAccount.address, orderHash, 2, false)
      .then((e) =>
        console.log(`Order info: ${JSON.stringify(e, bigIntReplacer)}`),
      );
  }

  // just a dummy example how one can get txHash of the executed order onchain through TradeEvent
  // there is also an wss event which fire tx hash where  taker order was settled
  if (line.startsWith("queryTransactionByOrderHash")) {
    // queryTransactionByOrderHash <orderHash>
    let [_, orderHash] = line.split(" ");
    queryTransactionHash(
      routerSDK,
      rpcProvider,
      clientAccount.address,
      orderHash,
    ).then((e) => console.log("Tx hash response:", e));
  }

  if (line.startsWith("close")) {
    process.exit();
  }
});
