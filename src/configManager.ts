import {
  LaunchConfig,
  ComputedNetwork,
  Node,
  Parachain,
  Override,
  RelayChainConfig,
} from "./types";
import { getSha256 } from "./utils";
import path, { resolve } from "path";
import fs from "fs";
const debug = require("debug")("zombie::config-manager");

// CONSTANTS
export const REGULAR_BIN_PATH = "/usr/local/bin/substrate";
// The remote port prometheus can be accessed with
export const PROMETHEUS_PORT = 9615;
// The remote port websocket to access the RPC
export const RPC_WS_PORT = 9933;
// The remote port http to access the RPC
export const RPC_HTTP_PORT = 9944;
// The port substrate listens for p2p connections on
export const P2P_PORT = 30333;

export const DEFAULT_GLOBAL_TIMEOUT = 1200; // 20 mins
export const DEFAULT_INDIVIDUAL_TEST_TIMEOUT = 10; // seconds
export const DEFAULT_COMMAND = "polkadot";
export const DEFAULT_IMAGE = "parity/substrate:latest";
export const DEFAULT_ARGS: string[] = [];
export const DEFAULT_CHAIN = "rococo-local";
export const DEFAULT_BOOTNODE_PEER_ID =
  "12D3KooWEyoppNCUx8Yx66oV9fJnriXwCcXwDDUA2kj6vnc6iDEp";
export const DEFAULT_BOOTNODE_DOMAIN = "bootnode";
export const DEFAULT_REMOTE_DIR = "/cfg";
export const DEFAULT_CHAIN_SPEC = "{{chainName}}-plain.json";
export const DEFAULT_CHAIN_SPEC_RAW = "{{chainName}}-raw.json";
export const DEFAULT_CHAIN_SPEC_COMMAND =
  "{{DEFAULT_COMMAND}} build-spec --chain {{chainName}} --disable-default-bootnode";
export const DEFAULT_GENESIS_GENERATE_SUBCOMMAND ="export-genesis-state";
export const DEFAULT_WASM_GENERATE_SUBCOMMAND = "export-genesis-wasm";
export const DEFAULT_ADDER_COLLATOR_BIN = "adder-collator";
export const DEFAULT_CUMULUS_COLLATOR_BIN = "polkadot-collator";
export const DEFAULT_COLLATOR_IMAGE = "paritypr/colander:4131-e5c7e975";
export const FINISH_MAGIC_FILE = "/tmp/finished.txt";
export const GENESIS_STATE_FILENAME = "genesis-state";
export const GENESIS_WASM_FILENAME = "genesis-wasm";

export const WAIT_UNTIL_SCRIPT_SUFIX = `until [ -f ${FINISH_MAGIC_FILE} ]; do echo waiting for copy files to finish; sleep 1; done; echo copy files has finished`;
export const TRANSFER_CONTAINER_NAME = "transfer-files-container";
export const ZOMBIE_BUCKET = "zombienet-logs";
export const WS_URI_PATTERN = "ws://127.0.0.1:{{PORT}}";
export const METRICS_URI_PATTERN = "http://127.0.0.1:{{PORT}}/metrics";
export const BAKCCHANNEL_URI_PATTERN = "http://127.0.0.1:{{PORT}}";
export const BAKCCHANNEL_PORT = 3000;
export const BAKCCHANNEL_POD_NAME = "backchannel";

export const ZOMBIE_WRAPPER = "zombie-wrapper.sh";
// get the path of the zombie wrapper
export const zombieWrapperPath = resolve(
  __dirname,
  `../scripts/${ZOMBIE_WRAPPER}`
);

export const LOKI_URL_FOR_NODE =
  "https://grafana.parity-mgmt.parity.io/explore?orgId=1&left=%5B%22now-3h%22,%22now%22,%22loki.parity-zombienet%22,%7B%22expr%22:%22%7Bpod%3D~%5C%22{{namespace}}%2F{{podName}}%5C%22%7D%22,%22refId%22:%22A%22,%22range%22:true%7D%5D";

export const AVAILABLE_PROVIDERS = ["podman", "kubernetes", "native"];

export async function generateNetworkSpec(
  config: LaunchConfig
): Promise<ComputedNetwork> {
  let globalOverrides: Override[] = [];
  if (config.relaychain.default_overrides) {
    globalOverrides = await Promise.all(
      config.relaychain.default_overrides.map(async (override) => {
        const valid_local_path = await getLocalOverridePath(
          config.configBasePath,
          override.local_path
        );
        return {
          local_path: valid_local_path,
          remote_name: override.remote_name,
        };
      })
    );
  }

  let networkSpec: any = {
    relaychain: {
      defaultImage: config.relaychain.default_image || DEFAULT_IMAGE,
      defaultCommand: config.relaychain.default_command || DEFAULT_COMMAND,
      nodes: [],
      chain: config.relaychain.chain,
      overrides: Promise.all(globalOverrides),
    },
    parachains: [],
  };

  const chainName = config.relaychain.chain || DEFAULT_CHAIN;

  // settings
  networkSpec.settings = {
    timeout: DEFAULT_GLOBAL_TIMEOUT,
    ...(config.settings ? config.settings : {}),
  };

  // default provider
  if (!networkSpec.settings.provider)
    networkSpec.settings.provider = "kubernetes";

  // if we don't have a path to the chain-spec leave undefined to create
  if (config.relaychain.chain_spec_path) {
    const chainSpecPath = resolve(
      process.cwd(),
      config.relaychain.chain_spec_path
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
          chainName
        ).replace("{{DEFAULT_COMMAND}}", networkSpec.relaychain.defaultCommand);
  }

  const relayChainBootnodes: string[] = [];
  for (const node of config.relaychain.nodes) {
    const command = node.command
      ? node.command
      : networkSpec.relaychain.defaultCommand;
    const image = node.image ? node.image : config.relaychain.default_image;
    let args: string[] = [];
    if (node.args) args = args.concat(node.args);
    if (node.extra_args) args = args.concat(node.extra_args);

    const env = [
      { name: "COLORBT_SHOW_HIDDEN", value: "1" },
      { name: "RUST_BACKTRACE", value: "FULL" },
    ];
    if (node.env) env.push(...node.env);

    let nodeOverrides: Override[] = [];
    if (node.overrides) {
      nodeOverrides = await Promise.all(
        node.overrides.map(async (override) => {
          const valid_local_path = await getLocalOverridePath(
            config.configBasePath,
            override.local_path
          );
          return {
            local_path: valid_local_path,
            remote_name: override.remote_name,
          };
        })
      );
    }

    const isValidator = node.validator
      ? true
      : isValidatorbyArgs(args)
      ? true
      : false;

    // enable --prometheus-external by default
    const prometheusExternal =
      config.settings?.prometheus !== undefined
        ? config.settings.prometheus
        : true;

    const nodeName = getUniqueName(node.name);
    // build node Setup
    const nodeSetup: Node = {
      name: nodeName,
      key: getSha256(nodeName),
      command: command || DEFAULT_COMMAND,
      commandWithArgs: node.commandWithArgs,
      image: image || DEFAULT_IMAGE,
      wsPort: node.wsPort ? node.wsPort : RPC_WS_PORT,
      port: node.port ? node.port : P2P_PORT,
      chain: chainName,
      validator: isValidator,
      args,
      env,
      bootnodes: relayChainBootnodes,
      telemetryUrl: config.settings?.telemetry
        ? "ws://telemetry:8000/submit 0"
        : "",
      telemetry: config.settings?.telemetry ? true : false,
      prometheus: prometheusExternal,
      overrides: [...globalOverrides, ...nodeOverrides],
      addToBootnodes: node.add_to_bootnodes ? true : false
    };

    networkSpec.relaychain.nodes.push(nodeSetup);
  }

  if (config.parachains && config.parachains.length) {
    for (const parachain of config.parachains) {
      let computedStatePath,
        computedStateCommand,
        computedWasmPath,
        computedWasmCommand;
      const bootnodes = relayChainBootnodes;
      const collatorBinary = parachain.collator.commandWithArgs
        ? parachain.collator.commandWithArgs.split(" ")[0]
        : parachain.collator.command
        ? parachain.collator.command
        : DEFAULT_ADDER_COLLATOR_BIN;

      if (parachain.genesis_state_path) {
        const genesisStatePath = resolve(
          process.cwd(),
          parachain.genesis_state_path
        );
        if (!fs.existsSync(genesisStatePath)) {
          console.error(
            "Genesis spec provided does not exist: ",
            genesisStatePath
          );
          process.exit();
        } else {
          computedStatePath = genesisStatePath;
        }
      } else {
        computedStateCommand = parachain.genesis_state_generator
          ? parachain.genesis_state_generator
          : `${collatorBinary} ${DEFAULT_GENESIS_GENERATE_SUBCOMMAND}`;

        if(! collatorBinary.includes("adder")) {
          computedStateCommand += ` --parachain-id ${parachain.id}`;
        }

        computedStateCommand += ` > {{CLIENT_REMOTE_DIR}}/${GENESIS_STATE_FILENAME}`;
      }

      if (parachain.genesis_wasm_path) {
        const genesisWasmPath = resolve(
          process.cwd(),
          parachain.genesis_wasm_path
        );
        if (!fs.existsSync(genesisWasmPath)) {
          console.error(
            "Genesis spec provided does not exist: ",
            genesisWasmPath
          );
          process.exit();
        } else {
          computedWasmPath = genesisWasmPath;
        }
      } else {
        computedWasmCommand = parachain.genesis_wasm_generator
          ? parachain.genesis_wasm_generator
          : `${collatorBinary} ${DEFAULT_WASM_GENERATE_SUBCOMMAND} > {{CLIENT_REMOTE_DIR}}/${GENESIS_WASM_FILENAME}`;
      }

      let args: string[] = [];
      if (parachain.collator.args) args = args.concat(parachain.collator.args);

      const env = [
        { name: "COLORBT_SHOW_HIDDEN", value: "1" },
        { name: "RUST_BACKTRACE", value: "FULL" },
      ];
      if (parachain.collator.env) env.push(...parachain.collator.env);

      let parachainSetup: Parachain = {
        id: parachain.id,
        addToGenesis:
          parachain.addToGenesis === undefined ? true : parachain.addToGenesis, // add by default
        collator: {
          name: getUniqueName(parachain.collator.name || "collator"),
          command: collatorBinary,
          commandWithArgs: parachain.collator.commandWithArgs,
          image: parachain.collator.image || DEFAULT_COLLATOR_IMAGE,
          chain: chainName,
          args: parachain.collator.args || [],
          env: env,
          bootnodes
        },
      };

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
      };

      networkSpec.parachains.push(parachainSetup);
    }
  }

  networkSpec.types = config.types ? config.types : {};
  networkSpec.configBasePath = config.configBasePath;

  return networkSpec as ComputedNetwork;
}

export function generateBootnodeSpec(config: ComputedNetwork): Node {
  const nodeSetup: Node = {
    name: "bootnode",
    key: "0000000000000000000000000000000000000000000000000000000000000001",
    command: config.relaychain.defaultCommand || DEFAULT_COMMAND,
    image: config.relaychain.defaultImage || DEFAULT_IMAGE,
    chain: config.relaychain.chain,
    port: P2P_PORT,
    wsPort: RPC_WS_PORT,
    validator: false,
    args: [
      "--ws-external",
      "--rpc-external",
      "--listen-addr",
      "/ip4/0.0.0.0/tcp/30333"
    ],
    env: [],
    bootnodes: [],
    telemetryUrl: "",
    overrides: [],
    zombieRole: "bootnode"
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
  definedLocalPath: string
): Promise<string> {
  // let check if local_path is full or relative
  let local_real_path = definedLocalPath;
  if (!fs.existsSync(definedLocalPath)) {
    // check relative to config
    local_real_path = path.join(configBasePath, definedLocalPath);
    if (!fs.existsSync(local_real_path))
      throw new Error(
        "Invalid override config, only fullpaths or relative paths (from the config) are allowed"
      );
  }

  return local_real_path;
}

function isValidatorbyArgs(nodeArgs: string[]): boolean {
  const defaultAccounts = ["alice", "bob", "charlie", "dave", "eve", "ferdie"];
  const validatorAccount = defaultAccounts.find((acc) =>
    nodeArgs.includes(`--${acc}`)
  );
  return validatorAccount ? true : false;
}
