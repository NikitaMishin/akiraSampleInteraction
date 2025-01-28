import { Address } from "layerakira-js";
import { Currency } from "./types";
import { Account, Contract, RpcProvider } from "starknet";
import executorAbi from "./abi/executor.json";
import coreAbi from "./abi/core.json";
import { OurSigner } from "./signer";

export const baseHttpApiUrl = "https://api-testnet.layerakira.xyz";
export const wssApiUrl = "wss://api-testnet.layerakira.xyz/ws";
export const coreAddress: Address =
  "0x5bd2c04c00b9d1c2f7606443ff812b3a7cfb699fc67a2a27a69f133ae02d793";
export const routerAddress: Address =
  "0xfe8d091c5702700050589cc1a59aaca8d83363c4ece6b6cd0d2efcf7a31670";
export const executorAddress: Address =
  "0x581d33c0698a0f2cef0d024c5b209fcc851f56597fbec0764389aa8c9bedc79";
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
};

// below likely only stuff to tweak

export const starknetRPC = "TODO";
export const routerSource = "TODO";

export const rpcProvider = new RpcProvider({ nodeUrl: starknetRPC });
export const executorContract = new Contract(
  executorAbi,
  executorAddress,
  rpcProvider,
);
export const coreContract = new Contract(coreAbi, coreAddress, rpcProvider);

export const routerFeeRecipient = "TODO";
// Account that router would use to listen on events and submitting orders
export const routerAccount = new Account(rpcProvider, "TODO", "TODO");
// only needs to be specified if you plan to use option 2
export const routerSigner = new OurSigner("TODO");
