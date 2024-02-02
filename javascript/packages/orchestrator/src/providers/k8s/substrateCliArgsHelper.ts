import { getClient } from "../client";
import { createTempNodeDef, genNodeDef } from "./dynResourceDefinition";
import { KubeClient } from "./kubeClient";

export const getCliArgsHelp = async (
  image: string,
  command: string,
): Promise<string> => {
  const client = getClient() as KubeClient;
  // Use echo to not finish the pod with error status.
  const fullCmd = `${command} --help || echo ""`;
  const node = await createTempNodeDef(
    "temp",
    image,
    "", // Don't used
    fullCmd,
    false,
  );

  const podDef = await genNodeDef(client.namespace, node);
  const podName = podDef.metadata.name;
  await client.spawnFromDef(podDef);
  const logs = await client.getNodeLogs(podName);

  return logs;
};
