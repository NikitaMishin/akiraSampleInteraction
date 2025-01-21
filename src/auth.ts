import * as SDK from "layerakira-js";
import { convertBigIntToString } from "./utils";
import { CHAIN_ID } from "./constants";
import { Account } from "starknet";

export async function authenticateAccount(
  sdkClient: SDK.LayerAkiraSDK,
  account: Account,
): Promise<string> {
  const signer = await account.signer.getPubKey();
  const accountAddress = account.address;

  const signData = await sdkClient.akiraHttp.getSignData(
    signer,
    accountAddress,
  );
  if (signData.result === undefined) {
    console.log(JSON.stringify(signData));
    return "";
  }

  const typedData = convertBigIntToString(
    SDK.getTypedDataForJWT(signData.result!, SDK.getDomain(CHAIN_ID)),
  );
  const sign = await account.signMessage(typedData);
  const res = await sdkClient.akiraHttp.auth(
    signData.result!,
    SDK.castToApiSignature(sign),
  );

  if (res.result === undefined) {
    console.log(JSON.stringify(res.result));
    return "";
  }
  return res.result;
}
