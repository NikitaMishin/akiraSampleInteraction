import * as SDK from "layerakira-js";

export interface SORPair {
  tokenIn: SDK.ERC20Token;
  tokenOut: SDK.ERC20Token;
  baseToken: SDK.ERC20Token;
  quoterToken: SDK.ERC20Token;
}

export interface SORPath {
  name: string;
  description: string;
  pairs: SORPair[];
}

/**
 * Testnet sor pairs
 * All pairs against aUSDC are direct pairs, unless otherwise specified
 */
export const SOR_PATH: Map<string, SORPath> = new Map([
  [
    "strk_p",
    {
      name: "strk_circle",
      description: "STRK -> AUSDC -> AUSDT",
      pairs: [
        {
          tokenIn: "STRK" as SDK.ERC20Token,
          tokenOut: "AUSDC" as SDK.ERC20Token,
          baseToken: "STRK" as SDK.ERC20Token,
          quoterToken: "AUSDC" as SDK.ERC20Token,
        },
        {
          tokenIn: "AUSDC" as SDK.ERC20Token,
          tokenOut: "AUSDT" as SDK.ERC20Token,
          baseToken: "AUSDC" as SDK.ERC20Token,
          quoterToken: "AUSDT" as SDK.ERC20Token,
        },
      ],
    },
  ],
  [
    "eth_p",
    {
      name: "eth_circle",
      description: "ETH -> AUSDC -> AUSDT",
      pairs: [
        {
          tokenIn: "ETH" as SDK.ERC20Token,
          tokenOut: "AUSDC" as SDK.ERC20Token,
          baseToken: "ETH" as SDK.ERC20Token,
          quoterToken: "AUSDC" as SDK.ERC20Token,
        },
        {
          tokenIn: "AUSDC" as SDK.ERC20Token,
          tokenOut: "AUSDT" as SDK.ERC20Token,
          baseToken: "AUSDC" as SDK.ERC20Token,
          quoterToken: "AUSDT" as SDK.ERC20Token,
        },
      ],
    },
  ],
  [
    "aave_eth",
    {
      name: "aave_eth_circle",
      description: "AAAVE -> AUSDC -> AETH",
      pairs: [
        {
          tokenIn: "AAAVE" as SDK.ERC20Token,
          tokenOut: "AUSDC" as SDK.ERC20Token,
          baseToken: "AAAVE" as SDK.ERC20Token,
          quoterToken: "AUSDC" as SDK.ERC20Token,
        },
        {
          tokenIn: "AUSDC" as SDK.ERC20Token,
          tokenOut: "AETH" as SDK.ERC20Token,
          baseToken: "AETH" as SDK.ERC20Token,
          quoterToken: "AUSDC" as SDK.ERC20Token,
        },
      ],
    },
  ],
  [
    "aave_uni",
    {
      name: "aave_uni_circle",
      description: "AAAVE -> AUSDC -> AUNI",
      pairs: [
        {
          tokenIn: "AAAVE" as SDK.ERC20Token,
          tokenOut: "AUSDC" as SDK.ERC20Token,
          baseToken: "AAAVE" as SDK.ERC20Token,
          quoterToken: "AUSDC" as SDK.ERC20Token,
        },
        {
          tokenIn: "AUSDC" as SDK.ERC20Token,
          tokenOut: "AUNI" as SDK.ERC20Token,
          baseToken: "AUNI" as SDK.ERC20Token,
          quoterToken: "AUSDC" as SDK.ERC20Token,
        },
      ],
    },
  ],
  [
    "uni_aave",
    {
      name: "uni_aave_circle",
      description: "AUNI -> AUSDC -> AAVE",
      pairs: [
        {
          tokenIn: "AUNI" as SDK.ERC20Token,
          tokenOut: "AUSDC" as SDK.ERC20Token,
          baseToken: "AUNI" as SDK.ERC20Token,
          quoterToken: "AUSDC" as SDK.ERC20Token,
        },
        {
          tokenIn: "AUSDC" as SDK.ERC20Token,
          tokenOut: "AAAVE" as SDK.ERC20Token,
          baseToken: "AAAVE" as SDK.ERC20Token,
          quoterToken: "AUSDC" as SDK.ERC20Token,
        },
      ],
    },
  ],
  [
    "eth_aave",
    {
      name: "eth_aave_circle",
      description: "AETH -> AUSDC -> AAVE",
      pairs: [
        {
          tokenIn: "AETH" as SDK.ERC20Token,
          tokenOut: "AUSDC" as SDK.ERC20Token,
          baseToken: "AETH" as SDK.ERC20Token,
          quoterToken: "AUSDC" as SDK.ERC20Token,
        },
        {
          tokenIn: "AUSDC" as SDK.ERC20Token,
          tokenOut: "AAAVE" as SDK.ERC20Token,
          baseToken: "AAAVE" as SDK.ERC20Token,
          quoterToken: "AUSDC" as SDK.ERC20Token,
        },
      ],
    },
  ],
  [
    "test_p",
    {
      name: "test_circle",
      description: "AUSDC -> AETH -> AUSDT",
      pairs: [
        {
          tokenIn: "AUSDC" as SDK.ERC20Token,
          tokenOut: "AETH" as SDK.ERC20Token,
          baseToken: "AETH" as SDK.ERC20Token,
          quoterToken: "AUSDC" as SDK.ERC20Token,
        },
        {
          tokenIn: "AETH" as SDK.ERC20Token,
          tokenOut: "AUSDT" as SDK.ERC20Token,
          baseToken: "AETH" as SDK.ERC20Token,
          quoterToken: "AUSDT" as SDK.ERC20Token,
        },
      ],
    },
  ],
  [
    "test_p02",
    {
      name: "test02_circle",
      description: "AETH -> AUSDC -> AUSDT",
      pairs: [
        {
          tokenIn: "AETH" as SDK.ERC20Token,
          tokenOut: "AUSDC" as SDK.ERC20Token,
          baseToken: "AETH" as SDK.ERC20Token,
          quoterToken: "AUSDC" as SDK.ERC20Token,
        },
        {
          tokenIn: "AUSDC" as SDK.ERC20Token,
          tokenOut: "AUSDT" as SDK.ERC20Token,
          baseToken: "AUSDC" as SDK.ERC20Token,
          quoterToken: "AUSDT" as SDK.ERC20Token,
        },
      ],
    },
  ],
]);
