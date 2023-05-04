import { SubstrateCliArgsVersion } from "../../types";
import { getClient } from "../client";

export const getCliArgsVersion = async (
  image: string,
  command: string,
): Promise<SubstrateCliArgsVersion> => {
  const client = getClient();
  const fullCmd = `${command} --help | grep ws-port`;
  const logs = (await client.runCommand(["-c", fullCmd], { allowFail: true }))
    .stdout;

  return logs.includes("--ws-port <PORT>")
    ? SubstrateCliArgsVersion.V0
    : SubstrateCliArgsVersion.V1;
};
