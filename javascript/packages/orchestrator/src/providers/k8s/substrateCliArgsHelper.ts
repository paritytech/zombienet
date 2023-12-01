import { SubstrateCliArgsVersion } from "../../sharedTypes";
import { getClient } from "../client";
import { createTempNodeDef, genNodeDef } from "./dynResourceDefinition";
import { KubeClient } from "./kubeClient";

export const getCliArgsVersion = async (
  image: string,
  command: string,
): Promise<SubstrateCliArgsVersion> => {
  const client = getClient() as KubeClient;
  // use echo to not finish the pod with error status.
  const fullCmd = `${command} --help | grep ws-port || echo "V2"`;
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

  if logs.includes("--ws-port <PORT>") {
    return SubstrateCliArgsVersion.V0;
  } else if !logs.includes("--insecure-validator-i-know-what-i-do") {
    return SubstrateCliArgsVersion.V1;
  } else {
    return SubstrateCliArgsVersion.V2;
  }
};
