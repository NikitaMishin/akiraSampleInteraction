import { Address } from "layerakira-js";
import { Currency } from "./types";
import { Account, Contract, RpcProvider } from "starknet";
import executorAbi from "./abi/executor.json";
import coreAbi from "./abi/core.json";
import snip9Abi from "./abi/snip9.json";
import { OurSigner } from "./signer";
import { ERC20Token } from "layerakira-js/src/request_types";

export const baseHttpApiUrl = "https://api-testnet.layerakira.xyz";
export const wssApiUrl = "wss://api-testnet.layerakira.xyz/ws";
export const coreAddress: Address =
  "0x3593d9c41f3afda55fbffd73506937023870c9213d166ab36e5ca56c25c42bf";
export const routerAddress: Address =
  "0x32ef0b2ba8212d917409f3f3805c8c750c0252a93ad18be484aa6986c7d2bd4";
export const executorAddress: Address =
  "0x1315a7a8dea9df5f143ec6e1e86e1c13804b6278d12ac71c0741ca4efe139c2";
export const baseTradeAddress: Address =
  "0x1315a7a8dea9df5f143ec6e1e86e1c13804b6278d12ac71c0741ca4efe139c2";
export const snip9Address: Address =
  "0x14424982bdfb4ecbebc0376af0a95c63ebaebf93074615c81b77779c6463b2f";
export const rollupInvoker: Address =
  "0x01e46D921194e1e59Fb411c5446a286D3DDB707014729bea02700709efaE7609";
export const CHAIN_ID = "0x534e5f5345504f4c4941";
export const exchangeFeeRecipient =
  "0x051D992DB2A0B33C0a39CC821823F672B9C981CdBA429bE91380De9b84a85D4D";

export const CURRENCIES: Record<string, Currency> = {
  ETH: {
    name: "Ethereum",
    code: "ETH",
    address:
      "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    unit: 18,
  },
  STRK: {
    name: "Starknet",
    code: "STRK",
    address:
      "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    unit: 18,
  },
  USDC: {
    name: "USD Coin",
    code: "USDC",
    address:
      "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
    unit: 6,
  },
  USDT: {
    name: "USDT",
    code: "USDT",
    address:
      "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
    unit: 6,
  },
  AETH: {
    name: "Akira Ethereum",
    code: "AETH",
    address:
      "0x008a5529010b5dbf1cc6cfe457f3ea1964e6325838878af99f79fb62c0e19d73",
    unit: 18,
  },
  AUSDC: {
    name: "Akira USD Coin",
    code: "AUSDC",
    address:
      "0x060c1efa7d195d3b2c14c65fd5a2ada075a7c54ff4bc3fda9cc7bead527b3054",
    unit: 6,
  },
  AUSDT: {
    name: "AkiraUSDT",
    code: "AUSDT",
    address:
      "0x00d01adf56d9bf6c65617bc03127561d89807e5e8eb37f3fb8d0dc4c5116ea61",
    unit: 6,
  },
  AUNI: {
    name: "Akira Uniswap",
    code: "AUNI",
    address:
      "0x01274b87822f58a4bd15ef118393d708cdb8e87b93eff18e08ba9046e728373f",
    unit: 18,
  },
  ABNB: {
    name: "Akira Binance",
    code: "ABNB",
    address:
      "0x042aad20c38afadfd4c65fca9ce796bab1837986d39f1ee869cfc9366ae92e81",
    unit: 18,
  },
  AENA: {
    name: "Akira Enjin",
    code: "AENA",
    address:
      "0x069c639370e644ba0dbffefad0de207c47bf3f87070c98d60bbb8ccbee80ccb8",
    unit: 18,
  },
  ATON: {
    name: "Akira Toncoin",
    code: "ATON",
    address:
      "0x0421acde5c3231ee3d328bee1d99c556996628ef514ab10c449d748daa9aa001",
    unit: 9,
  },
  AAAVE: {
    name: "Akira Aave",
    code: "AAAVE",
    address:
      "0x026bd84ce6cb0edb93a7f46f9343cf9322ac9f0129ae66302af2e2d6558a2c1e",
    unit: 18,
  },
};

export const SUPPORTED_TOKENS = [
  { base: "AUSDC", quote: "AUSDT", pair: "AUSDC-AUSDT" },
  { base: "AETH", quote: "AUSDC", pair: "AETH-AUSDC" },
  { base: "STRK", quote: "AUSDC", pair: "STRK-AUSDC" },
  { base: "ABNB", quote: "AUSDC", pair: "ABNB-AUSDC" },
  { base: "ATON", quote: "AUSDC", pair: "ATON-AUSDC" },
  { base: "AUNI", quote: "AUSDC", pair: "AUNI-AUSDC" },
  { base: "AAAVE", quote: "AUSDC", pair: "AAAVE-AUSDC" },
  { base: "AENA", quote: "AUSDC", pair: "AENA-AUSDC" },
] as Array<{ base: string; quote: string; pair: string }>;

export const TOKEN_ORDERING = [
  // Quote tokens first
  "USDC",
  "USDT",
  "AUSDC",
  "AUSDT",
  // Then base tokens
  "AETH",
  "STRK",
  "ABNB",
  "ATON",
  "AUNI",
  "AAAVE",
  "AENA",
] as ERC20Token[];

// below likely only stuff to tweak

export const starknetRPC = "https://starknet-sepolia.public.blastapi.io";
export const routerSource = "TODO";

export const rpcProvider = new RpcProvider({ nodeUrl: starknetRPC });
export const executorContract = new Contract(
  executorAbi,
  executorAddress,
  rpcProvider,
);
export const snip9Contract = new Contract(snip9Abi, snip9Address, rpcProvider);
export const coreContract = new Contract(coreAbi, coreAddress, rpcProvider);

export const routerFeeRecipient = "TODO";
// Account that router would use to listen on events and submitting orders
export const routerAccount = new Account(rpcProvider, "TODO", "TODO");
// only needs to be specified if you plan to use option 2
export const routerSigner = new OurSigner("TODO");
