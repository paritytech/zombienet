import { SubstrateCliArgsVersion } from "../../types";
import { getClient } from "../client";
import { createTempNodeDef, genNodeDef } from "./dynResourceDefinition";
import { KubeClient } from "./kubeClient";

export const getCliArgsVersion = async (
  image: string,
  command: string,
): Promise<SubstrateCliArgsVersion> => {
  const client = getClient() as KubeClient;
  // use echo to not finish the pod with error status.
  const fullCmd = `${command} --help | grep ws-port || echo "V1"`;
  const node = await createTempNodeDef(
    "temp",
    image,
    "", // don't used
    fullCmd,
    false,
  );

  const podDef = await genNodeDef(client.namespace, node);
  const podName = podDef.metadata.name;
  await client.spawnFromDef(podDef);
  const logs = await client.getNodeLogs(podName);

  return logs.includes("--ws-port <PORT>")
    ? SubstrateCliArgsVersion.V0
    : SubstrateCliArgsVersion.V1;
};
