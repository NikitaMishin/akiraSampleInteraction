import { formattedDecimalToBigInt, spinSDKClient } from "./utils";
import { authenticateAccount } from "./auth";
import { Account, Signer } from "starknet";
import { CURRENCIES, routerAccount, rpcProvider } from "./constants";
import readline from "node:readline";
import {
  ExecutionReport,
  OrderConstructor,
  TickerSpecification,
} from "layerakira-js";
import { getTakerOrderStatus, subscribeToExecutionReports } from "./wss";
import { initializeOrderBuilder } from "./builder";
import { queryTransactionHash } from "./lib";
import * as SDK from "layerakira-js";
import { bigIntReplacer } from "layerakira-js/dist/api/http/utils";
import { TakerCli } from "./taker";
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
let taker: TakerCli;
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

const setUpTaker = async () => {
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
  taker = new TakerCli(orderBuilder, console.log);
};

setupRouterSDK((e) =>
  console.log(
    `Parsed evt: ${getTakerOrderStatus(e)}\n : ${JSON.stringify(e, bigIntReplacer)}`,
  ),
).then(() => {
  setUpTaker();
});

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
    taker.listSorPaths();
  }

  // samples
  // swap STRK 1 AETH 0.147 10 STRK true true true
  // swap STRK 1 AUSDT 0.147 100 STRK true true true
  // swap AAAVE 1 AETH 0.147 10 AETH true true true
  // swap AUSDC 50 AUSDT 50 50 AUSDT true true true
  // swap AETH 0.01 AUSDC 24.15 100 AETH false true true
  // swap AUSDC 5 AETH 0 10 AUSDC true true true
  // swap AETH 0.01 AETH 0 0 AETH true true true
  // <payField> <payAmount> <receiveField> <receiveAmount> <slippageBips> <gasToken> <snip9> <useNativeRouter> <externalFunds>
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
      externalFunds,
    ] = line.split(" ");
    const [payCurrency, receiveCurrency, gasCurrency] = [
      CURRENCIES[payCode],
      CURRENCIES[receiveCode],
      CURRENCIES[gasTokenCode],
    ];
    if (payCurrency.code === receiveCurrency.code) {
      console.log("Pay and receive currencies are the same");
      return;
    }
    let tweakedField: "pay" | "receive" =
      formattedDecimalToBigInt(payAmount, payCurrency.unit) > 0n
        ? "pay"
        : "receive";
    const isSnip9 = snip9.trim().toLowerCase() == "true";
    const nativeRouter = useNativeRouter.trim().toLowerCase() == "true";
    taker
      .placeTakerOrder(
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
        isSnip9,
        externalFunds.trim().toLowerCase() == "true",
        nativeRouter,
        parseInt(slippageBips),
      )
      .then((hash) => {
        console.log(`Order hash: ${hash}`);
      });
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
