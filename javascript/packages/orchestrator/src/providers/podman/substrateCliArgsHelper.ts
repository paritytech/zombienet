import { SubstrateCliArgsVersion } from "../../sharedTypes";
import { getClient } from "../client";
import { createTempNodeDef, genNodeDef } from "./dynResourceDefinition";

export const getCliArgsVersion = async (
  image: string,
  command: string,
): Promise<SubstrateCliArgsVersion> => {
  const client = getClient();
  const fullCmd = `${command} --help | grep ws-port`;
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

  return logs.includes("--ws-port <PORT>")
    ? SubstrateCliArgsVersion.V0
    : SubstrateCliArgsVersion.V2;
};
