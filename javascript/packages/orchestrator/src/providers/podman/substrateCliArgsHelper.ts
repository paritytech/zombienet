import { getClient } from "../client";
import { createTempNodeDef, genNodeDef } from "./dynResourceDefinition";

export const getCliArgsHelp = async (
  image: string,
  command: string,
): Promise<string> => {
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
  return logs;
};
