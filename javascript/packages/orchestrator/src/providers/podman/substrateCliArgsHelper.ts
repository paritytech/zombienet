import { SubstrateCliArgsVersion } from "../../sharedTypes";
import { getClient } from "../client";
import { createTempNodeDef, genNodeDef } from "./dynResourceDefinition";

export const getCliArgsVersion = async (
  image: string,
  command: string,
): Promise<SubstrateCliArgsVersion> => {
  const client = getClient();
  const fullCmd = `${command} --help`;
  const node = await createTempNodeDef(
    "temp",
    image,
    "", // don't used
    fullCmd,
  );

  const podDef = await genNodeDef(client.namespace, node);
  const podName = podDef.metadata.name;
  await client.spawnFromDef(podDef);
  const logs = await client.getNodeLogs(podName);

  if (logs.includes("--ws-port <PORT>")) {
    return SubstrateCliArgsVersion.V0;
  } else if (!logs.includes("--insecure-validator-i-know-what-i-do")) {
    return SubstrateCliArgsVersion.V1;
  } else {
    return SubstrateCliArgsVersion.V2;
  }
};
