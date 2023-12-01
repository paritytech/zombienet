import { SubstrateCliArgsVersion } from "../../sharedTypes";
import { getClient } from "../client";

export const getCliArgsVersion = async (
  image: string,
  command: string,
): Promise<SubstrateCliArgsVersion> => {
  const client = getClient();
  const fullCmd = `${command} --help | grep ws-port`;
  const logs = (await client.runCommand(["-c", fullCmd], { allowFail: true }))
    .stdout;


  if logs.includes("--ws-port <PORT>") {
    return SubstrateCliArgsVersion.V0;
  } else if !logs.includes("--insecure-validator-i-know-what-i-do") {
    return SubstrateCliArgsVersion.V1;
  } else {
    return SubstrateCliArgsVersion.V2;
  }
};
