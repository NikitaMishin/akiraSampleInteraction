import * as SDK from "layerakira-js";
import { SUPPORTED_TOKENS, TOKEN_ORDERING } from "../constants";
import { ERC20Token } from "layerakira-js";

export interface IAkiraPairInfoProvider {
  getAkiraPair: (
    spendToken: SDK.ERC20Token,
    receiveToken: SDK.ERC20Token,
  ) => SDK.TradedPair | undefined;
}

export class ConfigAkiraPairInfoProvider implements IAkiraPairInfoProvider {
  private ordering: Record<string, number>;

  constructor(ordering: ERC20Token[]) {
    this.ordering = ordering.reduce(
      (acc, token, index) => {
        acc[token] = index;
        return acc;
      },
      {} as Record<ERC20Token, number>,
    );
  }

  getAkiraPair(
    spendToken: SDK.ERC20Token,
    receiveToken: SDK.ERC20Token,
  ): SDK.TradedPair | undefined {
    const market = SUPPORTED_TOKENS.filter(
      (e) =>
        (e.base == spendToken && e.quote == receiveToken) ||
        (e.quote == spendToken && e.base == receiveToken),
    ).at(0);
    if (market) return { base: market.base, quote: market.quote };

    // @ts-ignore
    const [spendPriority, receivePriority] = [
      this.ordering[spendToken],
      this.ordering[receiveToken],
    ];
    if (spendPriority == undefined || receivePriority === undefined) {
      console.error("Undefined market ordering:", spendToken, receiveToken);
    }
    if (spendPriority < receivePriority)
      return { base: spendToken, quote: receiveToken };
    return { base: receiveToken, quote: spendToken };
  }
}

export const akiraPairInfoProvider: IAkiraPairInfoProvider =
  new ConfigAkiraPairInfoProvider(TOKEN_ORDERING);
