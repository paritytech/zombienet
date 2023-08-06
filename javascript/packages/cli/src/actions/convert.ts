import type { PolkadotLaunchConfig as ZombienetConfig } from "@zombienet/orchestrator";
import { decorators } from "@zombienet/utils";
import fs from "fs/promises";
import path from "path";
import { PolkadotLaunch } from "src/types";
import { DEFAULT_BALANCE } from "../constants";

type ArrayElement<ArrayType extends readonly unknown[]> =
  ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

export async function convert(filePath: string) {
  try {
    if (!filePath) {
      throw Error("Path of configuration file was not provided");
    }

    const { baseName, config } = await readPolkadotLaunchConfigFile(filePath);
    const convertedConfig = await convertConfig(config);
    await persistConfig(convertedConfig, baseName);
  } catch (err) {
    console.log(
      `\n ${decorators.red("Error: ")} \t ${decorators.bright(err)}\n`,
    );
  }
}

async function readPolkadotLaunchConfigFile(filePath: string): Promise<{
  baseName: string;
  config: PolkadotLaunch.LaunchConfig;
}> {
  const extension = path.extname(filePath);
  const baseName = path.basename(filePath, extension);
  let config;

  if (extension === ".json") {
    config = JSON.parse(await fs.readFile(filePath, "utf-8"));
  } else if (extension === ".js") {
    config = (await import(path.resolve(filePath))).config;
  } else {
    throw new Error("No valid extension was found.");
  }

  return { baseName, config };
}

function convertConfig(config: PolkadotLaunch.LaunchConfig): ZombienetConfig {
  const relaychain = convertRelaychain(config.relaychain);
  const parachains = convertParachains(
    config.simpleParachains,
    config.parachains,
  );
  const hrmpChannels = convertHrmpChannels(config.hrmpChannels);

  return {
    relaychain,
    parachains,
    hrmp_channels: hrmpChannels,
    types: config.types,
  };
}

function convertRelaychain(
  relaychain: PolkadotLaunch.LaunchConfig["relaychain"],
): ZombienetConfig["relaychain"] {
  const { chain, genesis, nodes = [], bin } = relaychain;

  const convertedNodes = nodes.map((node) => ({
    name: node.name,
    args: node.flags,
    ws_port: node.wsPort,
    rpc_port: node.rpcPort,
    p2p_port: node.port,
    balance: DEFAULT_BALANCE,
    validator: true,
    invulnerable: true,
  }));

  return {
    chain,
    default_command: bin,
    genesis,
    nodes: convertedNodes,
  };
}

function convertParachains(
  simpleParachains: PolkadotLaunch.LaunchConfig["simpleParachains"] = [],
  parachains: PolkadotLaunch.LaunchConfig["parachains"] = [],
): ZombienetConfig["parachains"] {
  const convertedSimpleParachains = simpleParachains.map(
    convertSimpleParachain,
  );
  const convertedParachains = parachains.map(convertParachain);

  return convertedSimpleParachains.concat(convertedParachains);
}

function convertSimpleParachain(
  simpleParachain: ArrayElement<
    PolkadotLaunch.LaunchConfig["simpleParachains"]
  >,
): ArrayElement<ZombienetConfig["parachains"]> {
  const { id, balance, port, bin } = simpleParachain;

  const collator = {
    name: "alice",
    command: bin,
    p2p_port: +port,
    balance: +balance || DEFAULT_BALANCE,
    validator: true,
    invulnerable: true,
  };

  return { id: +id, collators: [collator] };
}

function convertParachain(
  parachain: ArrayElement<PolkadotLaunch.LaunchConfig["parachains"]>,
): ArrayElement<ZombienetConfig["parachains"]> {
  const { id = "2000", balance, chain, nodes, bin } = parachain;

  const collators = nodes.map(
    ({ name = "", flags, rpcPort, wsPort, port }) => ({
      name,
      command: bin,
      args: flags,
      ws_port: wsPort,
      rpc_port: rpcPort,
      p2p_port: port,
      balance: +balance || DEFAULT_BALANCE,
      validator: true,
      invulnerable: true,
    }),
  );

  return { id: +id, chain, collators };
}

function convertHrmpChannels(
  hrmpChannels: PolkadotLaunch.LaunchConfig["hrmpChannels"],
): ZombienetConfig["hrmp_channels"] {
  return hrmpChannels.map(
    ({ sender, recipient, maxCapacity, maxMessageSize }) => ({
      sender,
      recipient,
      max_capacity: maxCapacity,
      max_message_size: maxMessageSize,
    }),
  );
}

async function persistConfig(config: ZombienetConfig, baseName: string) {
  const content = JSON.stringify(config);
  const path = `${baseName}-zombienet.json`;

  await fs.writeFile(path, content);
  console.log(`Converted JSON config exists now under: ${path}`);
}
