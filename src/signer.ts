import { AccountInterface, Signature, Signer, TypedData } from "starknet";
import { baseTradeAddress, CURRENCIES, executorAddress } from "./constants";
import { convertBigIntToString } from "./utils";
import {
  castToApiSignature,
  ERC20Token,
  getDomain,
  getOrderSignData,
  getSignDataHash,
  normalize,
  Order,
  TokenAddressMap,
  TraderSignature,
} from "layerakira-js";

export class OurSigner extends Signer {
  public signRaw(msgHash: string): Promise<Signature> {
    return super.signRaw(msgHash);
  }
}

export const calcOrderHashAndTypedData = (
  account: AccountInterface,
  order: Order,
  chainHexCode: string,
): [string, TypedData] => {
  const tokenAddressMap = Object.keys(CURRENCIES).reduce((acc, key) => {
    const currency = CURRENCIES[key];
    acc[key as ERC20Token] = currency.address;
    return acc;
  }, {} as TokenAddressMap);

  const typedData = convertBigIntToString(
    getOrderSignData(
      order,
      getDomain(chainHexCode),
      tokenAddressMap,
      baseTradeAddress,
    ),
  );

  return [normalize(getSignDataHash(typedData, account.address!)), typedData];
};

export const signOrder = async (
  account: AccountInterface,
  typedData: TypedData,
): Promise<TraderSignature> => {
  const signature = await account!.signMessage(typedData);
  return castToApiSignature(signature);
};
