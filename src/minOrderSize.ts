export const minMMOrderSize = new Map<string, Map<string, bigint>>([
  [
    "ETH",
    new Map<string, bigint>([
      ["STRK", 30000000000000000n], // 0.03
      ["USDC", 30000000000000000n],
      ["USDT", 30000000000000000n],
    ]),
  ],
  [
    "STRK",
    new Map<string, bigint>([
      ["USDC", 100000000000000000000n], // 100 STRK
      ["USDT", 100000000000000000000n],
    ]),
  ],
  ["USDC", new Map<string, bigint>([["USDT", 75_000000n]])],

  [
    "AETH",
    new Map<string, bigint>([
      ["AUSDC", 30000000000000000n],
      ["AUSDT", 30000000000000000n],
    ]),
  ],
  ["AUSDC", new Map<string, bigint>([["AUSDT", 75_000000n]])],
]);
