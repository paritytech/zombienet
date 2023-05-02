import { series } from "@zombienet/utils";
import { ComputedNetwork, SubstrateCliArgsVersion } from "../../types";
import { getClient } from "../client";
import { createTempNodeDef, genNodeDef } from "./dynResourceDefinition";
import { KubeClient } from "./kubeClient";

const getVersion = async (
  image: string,
  command: string,
): Promise<SubstrateCliArgsVersion> => {
  const client = getClient() as KubeClient;
  const fullCmd = `${command} --help | grep ws-port`;
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

export const setSubstrateCliArdsVersion = async (network: ComputedNetwork) => {
  // Calculate substrate cli version for each node
  // and set in the node to use later when we build the cmd.
  const imgCmdMap = new Map();
  network.relaychain.nodes.reduce((memo, node) => {
    const uniq_image_cmd = `${node.image}_${node.command}`;
    if (!memo.has(uniq_image_cmd))
      memo.set(uniq_image_cmd, { image: node.image, command: node.command });
    return memo;
  }, imgCmdMap);

  network.parachains.reduce((memo, parachain) => {
    for (const collator of parachain.collators) {
      const uniq_image_cmd = `${collator.image}_${collator.command}`;
      if (!memo.has(uniq_image_cmd))
        memo.set(uniq_image_cmd, {
          image: collator.image,
          command: collator.command,
        });
    }
    return memo;
  }, imgCmdMap);

  // check versions in series
  const promiseGenerators = [];
  for (const [, v] of imgCmdMap) {
    const getVersionPromise = async () => {
      const version = await getVersion(v.image, v.command);
      v.version = version;
      return version;
    };
    promiseGenerators.push(getVersionPromise);
  }

  await series(promiseGenerators, 4);

  // now we need to iterate and set in each node the version
  // IFF is not set
  for (const node of network.relaychain.nodes) {
    if (node.substrateCliArgsVersion) continue;
    const uniq_image_cmd = `${node.image}_${node.command}`;
    node.substrateCliArgsVersion = imgCmdMap.get(uniq_image_cmd).version;
  }

  for (const parachain of network.parachains) {
    for (const collator of parachain.collators) {
      if (collator.substrateCliArgsVersion) continue;
      const uniq_image_cmd = `${collator.image}_${collator.command}`;
      collator.substrateCliArgsVersion = imgCmdMap.get(uniq_image_cmd).version;
    }
  }
};
