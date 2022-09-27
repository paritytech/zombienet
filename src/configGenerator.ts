import fs from "fs";
import path, { resolve } from "path";

import {
  ARGS_TO_REMOVE,
  DEFAULT_ADDER_COLLATOR_BIN,
  DEFAULT_BALANCE,
  DEFAULT_CHAIN,
  DEFAULT_CHAIN_SPEC_COMMAND,
  DEFAULT_COLLATOR_IMAGE,
  DEFAULT_COMMAND,
  DEFAULT_GENESIS_GENERATE_SUBCOMMAND,
  DEFAULT_GLOBAL_TIMEOUT,
  DEFAULT_IMAGE,
  DEFAULT_PORTS,
  DEFAULT_WASM_GENERATE_SUBCOMMAND,
  GENESIS_STATE_FILENAME,
  GENESIS_WASM_FILENAME,
  ZOMBIE_WRAPPER,
} from "./constants";
import { generateKeyForNode } from "./keys";
import { decorate, PARA, whichPara } from "./paras-decorators";
import {
  ComputedNetwork,
  envVars,
  LaunchConfig,
  Node,
  NodeConfig,
  Override,
  Parachain,
} from "./types";
import { getSha256 } from "./utils/misc";
import { getRandomPort } from "./utils/net";

const debug = require("debug")("zombie::config-manager");

// get the path of the zombie wrapper
export const zombieWrapperPath = resolve(
  __dirname,
  `../scripts/${ZOMBIE_WRAPPER}`,
);

const DEFAULT_ENV: envVars[] = [
  { name: "COLORBT_SHOW_HIDDEN", value: "1" },
  { name: "RUST_BACKTRACE", value: "FULL" },
];

export async function generateNetworkSpec(
  config: LaunchConfig,
): Promise<ComputedNetwork> {
  let globalOverrides: Override[] = [];
  if (config.relaychain.default_overrides) {
    globalOverrides = await Promise.all(
      config.relaychain.default_overrides.map(async (override) => {
        const valid_local_path = await getLocalOverridePath(
          config.configBasePath,
          override.local_path,
        );
        return {
          local_path: valid_local_path,
          remote_name: override.remote_name,
        };
      }),
    );
  }

  let networkSpec: any = {
    configBasePath: config.configBasePath,
    relaychain: {
      defaultImage: config.relaychain.default_image || DEFAULT_IMAGE,
      defaultCommand: config.relaychain.default_command || DEFAULT_COMMAND,
      defaultArgs: config.relaychain.default_args || [],
      nodes: [],
      chain: config.relaychain.chain || DEFAULT_CHAIN,
      overrides: globalOverrides,
      defaultResources: config.relaychain.default_resources,
    },
    parachains: [],
  };

  if (config.relaychain.genesis)
    networkSpec.relaychain.genesis = config.relaychain.genesis;
  const chainName = config.relaychain.chain || DEFAULT_CHAIN;

  // settings
  networkSpec.settings = {
    timeout: DEFAULT_GLOBAL_TIMEOUT,
    enable_tracing: true,
    ...(config.settings ? config.settings : {}),
  };

  // default provider
  if (!networkSpec.settings.provider)
    networkSpec.settings.provider = "kubernetes";

  // if we don't have a path to the chain-spec leave undefined to create
  if (config.relaychain.chain_spec_path) {
    const chainSpecPath = resolve(
      process.cwd(),
      config.relaychain.chain_spec_path,
    );
    if (!fs.existsSync(chainSpecPath)) {
      console.error("Chain spec provided does not exist: ", chainSpecPath);
      process.exit();
    } else {
      networkSpec.relaychain.chainSpecPath = chainSpecPath;
    }
  } else {
    // Create the chain spec
    networkSpec.relaychain.chainSpecCommand = config.relaychain
      .chain_spec_command
      ? config.relaychain.chain_spec_command
      : DEFAULT_CHAIN_SPEC_COMMAND.replace(
          "{{chainName}}",
          networkSpec.relaychain.chain,
        ).replace("{{DEFAULT_COMMAND}}", networkSpec.relaychain.defaultCommand);
  }

  const relayChainBootnodes: string[] = [];
  for (const node of config.relaychain.nodes || []) {
    const nodeSetup = await getNodeFromConfig(
      networkSpec,
      node,
      relayChainBootnodes,
      globalOverrides,
      node.name, // group of 1
    );

    networkSpec.relaychain.nodes.push(nodeSetup);
  }

  for (const nodeGroup of config.relaychain.node_groups || []) {
    for (let i = 0; i < nodeGroup.count; i++) {
      let node: NodeConfig = {
        name: `${nodeGroup.name}-${i}`,
        image: nodeGroup.image || networkSpec.relaychain.defaultImage,
        command: nodeGroup.command,
        args: sanitizeArgs(nodeGroup.args || []),
        validator: true, // groups are always validators
        invulnerable: false,
        balance: DEFAULT_BALANCE,
        env: nodeGroup.env,
        overrides: nodeGroup.overrides,
        resources:
          nodeGroup.resources || networkSpec.relaychain.defaultResources,
      };
      const nodeSetup = await getNodeFromConfig(
        networkSpec,
        node,
        relayChainBootnodes,
        globalOverrides,
        nodeGroup.name,
      );
      networkSpec.relaychain.nodes.push(nodeSetup);
    }
  }

  if (networkSpec.relaychain.nodes.length < 1) {
    throw new Error("No NODE defined in config, please review.");
  }

  if (config.parachains && config.parachains.length) {
    for (const parachain of config.parachains) {
      const para: PARA = whichPara(parachain.chain || "");

      let computedStatePath,
        computedStateCommand,
        computedWasmPath,
        computedWasmCommand;
      const bootnodes = relayChainBootnodes;

      // collator could by defined in groups or
      // just using one collator definiton
      let collators = [];
      if (parachain.collator)
        collators.push(
          await getCollatorNodeFromConfig(
            networkSpec,
            parachain.collator,
            parachain.id,
            chainName,
            para,
            bootnodes,
            Boolean(parachain.cumulus_based),
          ),
        );
      for (const collatorConfig of parachain.collators || []) {
        collators.push(
          await getCollatorNodeFromConfig(
            networkSpec,
            collatorConfig,
            parachain.id,
            chainName,
            para,
            bootnodes,
            Boolean(parachain.cumulus_based),
          ),
        );
      }

      for (const collatorGroup of parachain.collator_groups || []) {
        for (let i = 0; i < collatorGroup.count; i++) {
          let node: NodeConfig = {
            name: `${collatorGroup.name}-${i}`,
            image: collatorGroup.image || networkSpec.relaychain.defaultImage,
            command: collatorGroup.command,
            args: sanitizeArgs(collatorGroup.args || []),
            validator: true, // groups are always validators
            invulnerable: false,
            balance: DEFAULT_BALANCE,
            env: collatorGroup.env,
            overrides: collatorGroup.overrides,
            resources:
              collatorGroup.resources ||
              networkSpec.relaychain.defaultResources,
          };
          collators.push(
            await getCollatorNodeFromConfig(
              networkSpec,
              node,
              parachain.id,
              chainName,
              para,
              bootnodes,
              Boolean(parachain.cumulus_based),
            ),
          );
        }
      }

      // use the first collator for state/wasm generation
      const firstCollator = collators[0];
      if (!firstCollator)
        throw new Error(
          `No Collator defined for parachain ${parachain.id}, please review.`,
        );

      const collatorBinary = firstCollator.commandWithArgs
        ? firstCollator.commandWithArgs.split(" ")[0]
        : firstCollator.command
        ? firstCollator.command
        : DEFAULT_ADDER_COLLATOR_BIN;

      if (parachain.genesis_state_path) {
        const genesisStatePath = resolve(
          process.cwd(),
          parachain.genesis_state_path,
        );
        if (!fs.existsSync(genesisStatePath)) {
          console.error(
            "Genesis spec provided does not exist: ",
            genesisStatePath,
          );
          process.exit();
        } else {
          computedStatePath = genesisStatePath;
        }
      } else {
        computedStateCommand = parachain.genesis_state_generator
          ? parachain.genesis_state_generator
          : `${collatorBinary} ${DEFAULT_GENESIS_GENERATE_SUBCOMMAND}`;

        computedStateCommand += ` > {{CLIENT_REMOTE_DIR}}/${GENESIS_STATE_FILENAME}`;
      }

      if (parachain.genesis_wasm_path) {
        const genesisWasmPath = resolve(
          process.cwd(),
          parachain.genesis_wasm_path,
        );
        if (!fs.existsSync(genesisWasmPath)) {
          console.error(
            "Genesis spec provided does not exist: ",
            genesisWasmPath,
          );
          process.exit();
        } else {
          computedWasmPath = genesisWasmPath;
        }
      } else {
        computedWasmCommand = parachain.genesis_wasm_generator
          ? parachain.genesis_wasm_generator
          : `${collatorBinary} ${DEFAULT_WASM_GENERATE_SUBCOMMAND}`;

        computedWasmCommand += ` > {{CLIENT_REMOTE_DIR}}/${GENESIS_WASM_FILENAME}`;
      }

      let parachainSetup: Parachain = {
        id: parachain.id,
        name: getUniqueName(parachain.id.toString()),
        para,
        cumulusBased: parachain.cumulus_based || false,
        addToGenesis:
          parachain.add_to_genesis === undefined
            ? true
            : parachain.add_to_genesis, // add by default
        registerPara:
          parachain.register_para === undefined
            ? true
            : parachain.register_para, // register by default
        collators,
      };

      if (parachain.chain) parachainSetup.chain = parachain.chain;

      // if we don't have a path to the chain-spec leave undefined to create
      if (parachain.chain_spec_path) {
        const chainSpecPath = resolve(process.cwd(), parachain.chain_spec_path);
        if (!fs.existsSync(chainSpecPath)) {
          console.error(
            `Chain spec provided for parachain id: ${parachain.id} does not exist: ${chainSpecPath}`,
          );
          process.exit();
        } else {
          parachainSetup.chainSpecPath = chainSpecPath;
        }
      }

      parachainSetup = {
        ...parachainSetup,
        ...(parachain.balance ? { balance: parachain.balance } : {}),
        ...(computedWasmPath ? { genesisWasmPath: computedWasmPath } : {}),
        ...(computedWasmCommand
          ? { genesisWasmGenerator: computedWasmCommand }
          : {}),
        ...(computedStatePath ? { genesisStatePath: computedStatePath } : {}),
        ...(computedStateCommand
          ? { genesisStateGenerator: computedStateCommand }
          : {}),
        ...(parachain.genesis ? { genesis: parachain.genesis } : {}),
      };

      networkSpec.parachains.push(parachainSetup);
    }
  }

  networkSpec.types = config.types ? config.types : {};
  if (config.hrmp_channels) networkSpec.hrmp_channels = config.hrmp_channels;

  return networkSpec as ComputedNetwork;
}

// TODO: move this fn to other module.
export async function generateBootnodeSpec(
  config: ComputedNetwork,
): Promise<Node> {
  const ports =
    config.settings.provider !== "native"
      ? DEFAULT_PORTS
      : {
          p2pPort: await getRandomPort(),
          wsPort: await getRandomPort(),
          rpcPort: await getRandomPort(),
          prometheusPort: await getRandomPort(),
        };

  const nodeSetup: Node = {
    name: "bootnode",
    key: "0000000000000000000000000000000000000000000000000000000000000001",
    command: config.relaychain.defaultCommand || DEFAULT_COMMAND,
    image: config.relaychain.defaultImage || DEFAULT_IMAGE,
    chain: config.relaychain.chain,
    validator: false,
    invulnerable: false,
    args: [
      "--ws-external",
      "--rpc-external",
      "--listen-addr",
      "/ip4/0.0.0.0/tcp/30333/ws",
    ],
    env: [],
    bootnodes: [],
    telemetryUrl: "",
    overrides: [],
    zombieRole: "bootnode",
    imagePullPolicy: config.settings.image_pull_policy || "Always",
    ...ports,
  };

  return nodeSetup;
}

interface UsedNames {
  [properyName: string]: number;
}

let mUsedNames: UsedNames = {};

export function getUniqueName(name: string): string {
  let uniqueName;
  if (!mUsedNames[name]) {
    mUsedNames[name] = 1;
    uniqueName = name;
  } else {
    uniqueName = `${name}-${mUsedNames[name]}`;
    mUsedNames[name] += 1;
  }

  return uniqueName;
}

async function getLocalOverridePath(
  configBasePath: string,
  definedLocalPath: string,
): Promise<string> {
  // let check if local_path is full or relative
  let local_real_path = definedLocalPath;
  if (!fs.existsSync(definedLocalPath)) {
    // check relative to config
    local_real_path = path.join(configBasePath, definedLocalPath);
    if (!fs.existsSync(local_real_path))
      throw new Error(
        "Invalid override config, only fullpaths or relative paths (from the config) are allowed",
      );
  }

  return local_real_path;
}

async function getCollatorNodeFromConfig(
  networkSpec: any,
  collatorConfig: NodeConfig,
  para_id: number,
  chain: string, // relay-chain
  para: PARA,
  bootnodes: string[], // parachain bootnodes
  cumulusBased: boolean,
): Promise<Node> {
  let args: string[] = [];
  if (collatorConfig.args)
    args = args.concat(sanitizeArgs(collatorConfig.args));

  const env = [
    { name: "COLORBT_SHOW_HIDDEN", value: "1" },
    { name: "RUST_BACKTRACE", value: "FULL" },
  ];
  if (collatorConfig.env) env.push(...collatorConfig.env);

  const collatorBinary = collatorConfig.command_with_args
    ? collatorConfig.command_with_args.split(" ")[0]
    : collatorConfig.command
    ? collatorConfig.command
    : DEFAULT_ADDER_COLLATOR_BIN;

  const collatorName = getUniqueName(collatorConfig.name || "collator");
  const [decoratedKeysGenerator] = decorate(para, [generateKeyForNode]);
  const accountsForNode = await decoratedKeysGenerator(collatorName);

  const ports =
    networkSpec.settings.provider !== "native"
      ? DEFAULT_PORTS
      : {
          p2pPort: collatorConfig.p2p_port || (await getRandomPort()),
          wsPort: collatorConfig.ws_port || (await getRandomPort()),
          rpcPort: collatorConfig.rpc_port || (await getRandomPort()),
          prometheusPort:
            collatorConfig.prometheus_port || (await getRandomPort()),
        };

  const node: Node = {
    name: collatorName,
    key: getSha256(collatorName),
    accounts: accountsForNode,
    validator: collatorConfig.validator !== false ? true : false, // --collator and --force-authoring by default
    invulnerable: collatorConfig.invulnerable,
    balance: collatorConfig.balance,
    image: collatorConfig.image || DEFAULT_COLLATOR_IMAGE,
    command: collatorBinary,
    commandWithArgs: collatorConfig.command_with_args,
    args: collatorConfig.args || [],
    chain,
    bootnodes,
    env,
    telemetryUrl: "",
    overrides: [],
    zombieRole: cumulusBased ? "cumulus-collator" : "collator",
    parachainId: para_id,
    imagePullPolicy: networkSpec.settings.image_pull_policy || "Always",
    ...ports,
  };

  return node;
}

async function getNodeFromConfig(
  networkSpec: any,
  node: NodeConfig,
  relayChainBootnodes: string[],
  globalOverrides: Override[],
  group?: string,
): Promise<Node> {
  const command = node.command
    ? node.command
    : networkSpec.relaychain.defaultCommand;
  const image = node.image ? node.image : networkSpec.relaychain.defaultImage;
  let args: string[] = sanitizeArgs(networkSpec.relaychain.defaultArgs || []);
  if (node.args) args = args.concat(sanitizeArgs(node.args));

  const uniqueArgs = [...new Set(args)];
  const env = node.env ? DEFAULT_ENV.concat(node.env) : DEFAULT_ENV;

  let nodeOverrides: Override[] = [];
  if (node.overrides) {
    nodeOverrides = await Promise.all(
      node.overrides.map(async (override) => {
        const valid_local_path = await getLocalOverridePath(
          networkSpec.configBasePath,
          override.local_path,
        );
        return {
          local_path: valid_local_path,
          remote_name: override.remote_name,
        };
      }),
    );
  }

  // by default nodes are validators except for those
  // set explicit to not be validators.
  const isValidator = node.validator !== false;

  // enable --prometheus-external by default
  const prometheusExternal =
    networkSpec.settings?.prometheus !== undefined
      ? networkSpec.settings.prometheus
      : true;

  const nodeName = getUniqueName(node.name);
  const accountsForNode = await generateKeyForNode(nodeName);
  const ports =
    networkSpec.settings.provider !== "native"
      ? DEFAULT_PORTS
      : {
          p2pPort: node.p2p_port || (await getRandomPort()),
          wsPort: node.ws_port || (await getRandomPort()),
          rpcPort: node.rpc_port || (await getRandomPort()),
          prometheusPort: node.prometheus_port || (await getRandomPort()),
        };

  // build node Setup
  const nodeSetup: Node = {
    name: nodeName,
    key: getSha256(nodeName),
    accounts: accountsForNode,
    command: command || DEFAULT_COMMAND,
    commandWithArgs: node.command_with_args,
    image: image || DEFAULT_IMAGE,
    chain: networkSpec.relaychain.chain,
    validator: isValidator,
    invulnerable: node.invulnerable,
    balance: node.balance,
    args: uniqueArgs,
    env,
    bootnodes: relayChainBootnodes,
    telemetryUrl: networkSpec.settings?.telemetry
      ? "ws://telemetry:8000/submit 0"
      : "",
    telemetry: networkSpec.settings?.telemetry ? true : false,
    prometheus: prometheusExternal,
    overrides: [...globalOverrides, ...nodeOverrides],
    addToBootnodes: node.add_to_bootnodes ? true : false,
    resources: node.resources || networkSpec.relaychain.defaultResources,
    zombieRole: "node",
    imagePullPolicy: networkSpec.settings.image_pull_policy || "Always",
    ...ports,
  };

  if (group) nodeSetup.group = group;
  return nodeSetup;
}

function sanitizeArgs(args: string[]): string[] {
  // Do NOT filter any argument to the internal full-node of the collator

  let removeNext = false;
  const separatorIndex = args.indexOf("--");
  const filteredArgs = args
    .slice(0, separatorIndex >= 0 ? separatorIndex : args.length)
    .filter((arg) => {
      if (removeNext) {
        removeNext = false;
        return false;
      }

      const argParsed = arg === "-d" ? "d" : arg.replace(/--/g, "");
      if (ARGS_TO_REMOVE[argParsed]) {
        if (ARGS_TO_REMOVE[argParsed] === 2) removeNext = true;
        return false;
      } else {
        return true;
      }
    });

  return filteredArgs;
}
