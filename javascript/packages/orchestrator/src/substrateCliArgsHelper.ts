import { series } from "@zombienet/utils";
import { getProvider } from "./providers";
import { Client } from "./providers/client";
import { ComputedNetwork } from "./configTypes";
import { SubstrateCliArgsVersion } from "./sharedTypes";
import { Scope } from "./network";

const debug = require("debug")("zombie::substrateCliArgsVersion");

export const setSubstrateCliArgsVersion = async (
  network: ComputedNetwork,
  client: Client,
) => {
  const { getCliArgsHelp } = getProvider(client.providerName);
  // Calculate substrate cli version for each node
  // and set in the node to use later when we build the cmd.
  const imgCmdMap = new Map();
  network.relaychain.nodes.reduce((memo, node) => {
    if (node.substrateCliArgsVersion) return memo;
    const uniq_image_cmd = `${node.image}_${node.command}`;
    if (!memo.has(uniq_image_cmd))
      memo.set(uniq_image_cmd, {
        image: node.image,
        command: node.command,
        scope: Scope.RELAY,
      });
    return memo;
  }, imgCmdMap);

  network.parachains.reduce((memo, parachain) => {
    for (const collator of parachain.collators) {
      if (collator.substrateCliArgsVersion) return memo;
      const uniq_image_cmd = `${collator.image}_${collator.command}`;
      if (!memo.has(uniq_image_cmd))
        memo.set(uniq_image_cmd, {
          image: collator.image,
          command: collator.command,
          scope: Scope.PARA,
        });
    }
    return memo;
  }, imgCmdMap);

  // check versions in series
  const promiseGenerators = [];
  for (const [, v] of imgCmdMap) {
    const getVersionPromise = async () => {
      const helpStdout = await getCliArgsHelp(v.image, v.command);
      const version = await getCliArgsVersion(helpStdout, v.scope);
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

function getCliArgsVersion(
  helpStdout: string,
  scope: Scope,
): SubstrateCliArgsVersion {
  // IFF stdout includes `ws-port` flag we are always in V0
  if (helpStdout.includes("--ws-port <PORT>")) {
    debug(`returning cliArgsVersion ${SubstrateCliArgsVersion.V0}`);
    return SubstrateCliArgsVersion.V0;
  }

  // If not, we should check the scope
  if (scope == Scope.RELAY) {
    const version = !helpStdout.includes(
      "--insecure-validator-i-know-what-i-do",
    )
      ? SubstrateCliArgsVersion.V1
      : SubstrateCliArgsVersion.V2;

    debug(`returning cliArgsVersion ${version}`);
    return version;
  } else if (scope == Scope.PARA) {
    const version = !helpStdout.includes("export-genesis-head")
      ? SubstrateCliArgsVersion.V2
      : SubstrateCliArgsVersion.V3;

    debug(`returning cliArgsVersion ${version}`);
    return version;
  } else {
    debug(`returning default cliArgsVersion`);
    // For other scopes we just return the latest version.
    return SubstrateCliArgsVersion.V3;
  }
}
