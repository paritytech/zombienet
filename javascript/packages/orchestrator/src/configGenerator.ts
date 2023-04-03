import fs from "fs";
import path, { resolve } from "path";

import {
  decorators,
  getRandomPort,
  getSha256,
  validateImageUrl,
} from "@zombienet/utils";
import {
  ARGS_TO_REMOVE,
  DEFAULT_ADDER_COLLATOR_BIN,
  DEFAULT_BALANCE,
  DEFAULT_CHAIN,
  DEFAULT_CHAIN_SPEC_COMMAND,
  DEFAULT_COLLATOR_IMAGE,
  DEFAULT_COMMAND,
  DEFAULT_CUMULUS_COLLATOR_BIN,
  DEFAULT_GENESIS_GENERATE_SUBCOMMAND,
  DEFAULT_GLOBAL_TIMEOUT,
  DEFAULT_IMAGE,
  DEFAULT_MAX_NOMINATIONS,
  DEFAULT_PORTS,
  DEFAULT_WASM_GENERATE_SUBCOMMAND,
  GENESIS_STATE_FILENAME,
  GENESIS_WASM_FILENAME,
  UNDYING_COLLATOR_BIN,
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
  ParachainConfig,
} from "./types";

const debug = require("debug")("zombie::config-manager");

// get the path of the zombie wrapper
export const zombieWrapperPath = resolve(__dirname, `../${ZOMBIE_WRAPPER}`);

const DEFAULT_ENV: envVars[] = [
  { name: "COLORBT_SHOW_HIDDEN", value: "1" },
  { name: "RUST_BACKTRACE", value: "FULL" },
];

const isIterable = (obj: any) => {
  // checks for null and undefined
  if (obj == null || typeof obj == "string") {
    return false;
  }
  return typeof obj[Symbol.iterator] === "function";
};

const configurationFileChecks = (config: LaunchConfig): void => {
  if ((config as any).hrmpChannels) {
    throw new Error(
      "'hrmpChannels' value the given configuration file is deprecated; Please use 'hrmp_channels' instead;",
    );
  }

  validateImageUrl(config?.relaychain?.default_image || DEFAULT_IMAGE);
  if (
    config?.relaychain?.node_groups &&
    isIterable(config?.relaychain?.node_groups)
  )
    for (const nodeGroup of config?.relaychain?.node_groups || []) {
      validateImageUrl(
        nodeGroup?.image || config?.relaychain.default_image || DEFAULT_IMAGE,
      );
    }
  if (config?.parachains && isIterable(config?.parachains))
    for (const parachain of config?.parachains) {
      if (parachain?.collator_groups && isIterable(parachain?.collator_groups))
        for (const collatorGroup of parachain?.collator_groups || []) {
          validateImageUrl(
            collatorGroup?.image ||
              config?.relaychain?.default_image ||
              DEFAULT_COLLATOR_IMAGE,
          );
        }
      if (parachain?.collators && isIterable(parachain?.collators))
        for (const collatorConfig of parachain?.collators || []) {
          validateImageUrl(collatorConfig?.image || DEFAULT_COLLATOR_IMAGE);
        }
    }
};

export async function generateNetworkSpec(
  config: LaunchConfig,
): Promise<ComputedNetwork> {
  let globalOverrides: Override[] = [];
  if (config.relaychain.default_overrides) {
    globalOverrides = await Promise.all(
      config.relaychain.default_overrides.map(async (override: Override) => {
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
      randomNominatorsCount: config.relaychain?.random_nominators_count || 0,
      maxNominations:
        config.relaychain?.max_nominations || DEFAULT_MAX_NOMINATIONS,
      nodes: [],
      chain: config.relaychain.chain || DEFAULT_CHAIN,
      overrides: globalOverrides,
      defaultResources: config.relaychain.default_resources,
    },
    parachains: [],
  };

  // check all imageURLs for validity
  // TODO: These checks should be agains all config items that needs check
  configurationFileChecks(config);

  if (config.relaychain.genesis)
    networkSpec.relaychain.genesis = config.relaychain.genesis;
  const chainName = config.relaychain.chain || DEFAULT_CHAIN;

  if (config.relaychain.default_db_snapshot)
    networkSpec.relaychain.defaultDbSnapshot =
      config.relaychain.default_db_snapshot;
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
      console.error(
        decorators.red(
          `Genesis spec provided does not exist: ${chainSpecPath}`,
        ),
      );
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
    for (let i = 0; i < (nodeGroup.count as number); i++) {
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
        db_snapshot: nodeGroup.db_snapshot,
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

      // parachain_relaychain
      const paraChainName =
        (parachain.chain ? parachain.chain + "_" : "") + chainName;

      // IF is defined use that value
      // else check if the command is one off undying/adder otherwise true
      const isCumulusBased =
        parachain.cumulus_based !== undefined
          ? parachain.cumulus_based
          : ![DEFAULT_ADDER_COLLATOR_BIN, UNDYING_COLLATOR_BIN].includes(
              getFirstCollatorCommand(parachain),
            );

      // collator could by defined in groups or
      // just using one collator definiton
      const collators = [];
      const collatorConfigs = parachain.collator ? [parachain.collator] : [];
      if (parachain.collators) collatorConfigs.push(...parachain.collators);

      for (const collatorConfig of collatorConfigs) {
        collators.push(
          await getCollatorNodeFromConfig(
            networkSpec,
            collatorConfig,
            parachain.id,
            paraChainName,
            para,
            bootnodes,
            isCumulusBased,
          ),
        );
      }

      for (const collatorGroup of parachain.collator_groups || []) {
        for (let i = 0; i < (collatorGroup.count as number); i++) {
          let node: NodeConfig = {
            name: `${collatorGroup.name}-${i}`,
            image: collatorGroup.image || DEFAULT_COLLATOR_IMAGE,
            command: collatorGroup.command || DEFAULT_CUMULUS_COLLATOR_BIN,
            args: sanitizeArgs(collatorGroup.args || [], { "listen-addr": 2 }),
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
              paraChainName,
              para,
              bootnodes,
              isCumulusBased,
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
        : firstCollator.command || DEFAULT_CUMULUS_COLLATOR_BIN;

      if (parachain.genesis_state_path) {
        const genesisStatePath = resolve(
          process.cwd(),
          parachain.genesis_state_path,
        );
        if (!fs.existsSync(genesisStatePath)) {
          console.error(
            decorators.red(
              `Genesis spec provided does not exist: ${genesisStatePath}`,
            ),
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
            decorators.red(
              `Genesis spec provided does not exist: ${genesisWasmPath}`,
            ),
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
        cumulusBased: isCumulusBased,
        addToGenesis:
          parachain.add_to_genesis === undefined
            ? true
            : parachain.add_to_genesis, // add by default
        registerPara:
          parachain.register_para === undefined
            ? true
            : parachain.register_para, // register by default
        onboardAsParachain:
          parachain.onboard_as_parachain === undefined
            ? true
            : parachain.onboard_as_parachain, // onboard as parachain by default
        collators,
      };

      if (parachain.chain) parachainSetup.chain = parachain.chain;

      // if we don't have a path to the chain-spec leave undefined to create
      if (parachain.chain_spec_path) {
        const chainSpecPath = resolve(process.cwd(), parachain.chain_spec_path);
        if (!fs.existsSync(chainSpecPath)) {
          console.error(
            decorators.red(
              `Chain spec provided for parachain id: ${parachain.id} does not exist: ${chainSpecPath}`,
            ),
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
  const provider = config.settings.provider;
  const ports = await getPorts(provider, {});
  const externalPorts = await getExternalPorts(provider, ports, {});

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
    prometheus: true, // --prometheus-external
    overrides: [],
    zombieRole: "bootnode",
    imagePullPolicy: config.settings.image_pull_policy || "Always",
    ...ports,
    externalPorts,
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
    args = args.concat(sanitizeArgs(collatorConfig.args, { "listen-addr": 2 }));

  const env = collatorConfig.env
    ? DEFAULT_ENV.concat(collatorConfig.env)
    : DEFAULT_ENV;

  const collatorBinary = collatorConfig.command_with_args
    ? collatorConfig.command_with_args.split(" ")[0]
    : collatorConfig.command || DEFAULT_CUMULUS_COLLATOR_BIN;

  const collatorName = getUniqueName(collatorConfig.name || "collator");
  const [decoratedKeysGenerator] = decorate(para, [generateKeyForNode]);
  const accountsForNode = await decoratedKeysGenerator(collatorName);

  const provider = networkSpec.settings.provider;
  const ports = await getPorts(provider, collatorConfig);
  const externalPorts = await getExternalPorts(provider, ports, collatorConfig);

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
    prometheus: prometheusExternal(networkSpec),
    overrides: [],
    zombieRole: cumulusBased ? "cumulus-collator" : "collator",
    parachainId: para_id,
    dbSnapshot: collatorConfig.db_snapshot,
    imagePullPolicy: networkSpec.settings.image_pull_policy || "Always",
    ...ports,
    externalPorts,
    p2pCertHash: collatorConfig.p2p_cert_hash,
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
  const image = node.image || networkSpec.relaychain.defaultImage;
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

  const nodeName = getUniqueName(node.name);
  const accountsForNode = await generateKeyForNode(nodeName);

  const provider = networkSpec.settings.provider;
  const ports = await getPorts(provider, node);
  const externalPorts = await getExternalPorts(provider, ports, node);

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
    prometheus: prometheusExternal(networkSpec),
    overrides: [...globalOverrides, ...nodeOverrides],
    addToBootnodes: node.add_to_bootnodes ? true : false,
    resources: node.resources || networkSpec.relaychain.defaultResources,
    zombieRole: "node",
    imagePullPolicy: networkSpec.settings.image_pull_policy || "Always",
    ...ports,
    externalPorts,
    p2pCertHash: node.p2p_cert_hash,
  };

  if (group) nodeSetup.group = group;

  const dbSnapshot = node.db_snapshot
    ? node.db_snapshot
    : networkSpec.relaychain.defaultDbSnapshot || null;

  if (dbSnapshot) nodeSetup.dbSnapshot = dbSnapshot;
  return nodeSetup;
}

function sanitizeArgs(
  args: string[],
  extraArgsToRemove: { [key: string]: number } = {},
): string[] {
  // Do NOT filter any argument to the internal full-node of the collator
  const augmentedArgsToRemove = { ...ARGS_TO_REMOVE, ...extraArgsToRemove };
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
      if (augmentedArgsToRemove[argParsed]) {
        if (augmentedArgsToRemove[argParsed] === 2) removeNext = true;
        return false;
      } else {
        return true;
      }
    });

  return filteredArgs;
}

async function getPorts(provider: string, nodeSetup: any): Promise<any> {
  let ports = DEFAULT_PORTS;

  if (provider === "native") {
    ports = {
      p2pPort: nodeSetup.p2p_port || (await getRandomPort()),
      wsPort: nodeSetup.ws_port || (await getRandomPort()),
      rpcPort: nodeSetup.rpc_port || (await getRandomPort()),
      prometheusPort: nodeSetup.prometheus_port || (await getRandomPort()),
    };
  }

  return ports;
}

async function getExternalPorts(
  provider: string,
  processPorts: any,
  nodeSetup: any,
): Promise<any> {
  if (provider === "native") return processPorts;

  const ports = {
    p2pPort: nodeSetup.p2p_port || (await getRandomPort()),
    wsPort: nodeSetup.ws_port || (await getRandomPort()),
    rpcPort: nodeSetup.rpc_port || (await getRandomPort()),
    prometheusPort: nodeSetup.prometheus_port || (await getRandomPort()),
  };

  return ports;
}

// enable --prometheus-external by default
// TODO: fix the `any` to an actual interface
const prometheusExternal = (networkSpec: ComputedNetwork): boolean => {
  return networkSpec.settings?.prometheus !== undefined
    ? networkSpec.settings.prometheus
    : true;
};

export function getFirstCollatorCommand(parachain: ParachainConfig): string {
  let cmd;
  if (parachain.collator) {
    cmd = parachain.collator.command_with_args || parachain.collator.command;
  } else if (parachain.collators?.length) {
    cmd =
      parachain.collators[0].command_with_args ||
      parachain.collators[0].command;
  } else if (parachain.collator_groups?.length) {
    cmd = parachain.collator_groups[0].command;
  }

  cmd = cmd || DEFAULT_CUMULUS_COLLATOR_BIN; // no command defined we use the default polkadot-parachain.
  debug(`cmd is ${cmd}`);
  cmd = cmd.split(" ")[0];
  return cmd.split("/").pop()!;
}
