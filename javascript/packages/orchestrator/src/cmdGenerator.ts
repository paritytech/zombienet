import { decorators, getRandomPort } from "@zombienet/utils";
import {
  DEFAULT_COMMAND,
  P2P_PORT,
  PROMETHEUS_PORT,
  RPC_HTTP_PORT,
  RPC_WS_PORT,
} from "./constants";
import { Node, SubstrateCliArgsVersion, ZombieRole } from "./types";

const debug = require("debug")("zombie::cmdGenerator");

interface ParachainArgsInterface {
  [key: string]: boolean;
}

interface PortsInterface {
  [key: string]: number;
}

function parseCmdWithArguments(
  commandWithArgs: string,
  useWrapper = true,
): string[] {
  const parts = commandWithArgs.split(" ");
  let finalCommand: string[] = [];
  if (["bash", "ash"].includes(parts[0])) {
    finalCommand.push(parts[0]);
    let partIndex;
    if (parts[1] === "-c") {
      finalCommand.push(parts[1]);
      partIndex = 2;
    } else {
      finalCommand.push("-c");
      partIndex = 1;
    }
    finalCommand = [...finalCommand, ...[parts.slice(partIndex).join(" ")]];
  } else {
    finalCommand = [commandWithArgs];
    if (useWrapper) finalCommand.unshift("/cfg/zombie-wrapper.sh");
  }

  return finalCommand;
}

export async function genCumulusCollatorCmd(
  nodeSetup: Node,
  cfgPath = "/cfg",
  dataPath = "/data",
  relayDataPath = "/relay-data",
  useWrapper = true,
): Promise<string[]> {
  const { name, chain, parachainId, key, validator, commandWithArgs } =
    nodeSetup;

  // command with args
  if (commandWithArgs) {
    return parseCmdWithArguments(commandWithArgs, useWrapper);
  }

  const parachainAddedArgs: ParachainArgsInterface = {
    "--name": true,
    "--collator": true,
    "--base-path": true,
    "--port": true,
    "--ws-port": true,
    "--rpc-port": true,
    "--chain": true,
    "--prometheus-port": true,
  };

  let fullCmd: string[] = [
    nodeSetup.command || DEFAULT_COMMAND,
    "--name",
    name,
    "--node-key",
    key!,
    "--chain",
    `${cfgPath}/${chain}-${parachainId}.json`,
    "--base-path",
    dataPath,
    "--listen-addr",
    `/ip4/0.0.0.0/tcp/${nodeSetup.p2pPort ? nodeSetup.p2pPort : P2P_PORT}/ws`,
    "--prometheus-external",
    "--rpc-cors all",
    "--unsafe-rpc-external",
    "--rpc-methods unsafe",
  ];

  if(nodeSetup.substrateCliArgsVersion === SubstrateCliArgsVersion.V0) fullCmd.push("--unsafe-ws-external");
  const portFlags = getPortFlagsByCliArgsVersion(nodeSetup);

  for (const [k, v] of Object.entries(portFlags)) {
    fullCmd.push(...[k, v.toString()]);
  }

  const chainParts = chain.split("_");
  const relayChain =
    chainParts.length > 1 ? chainParts[chainParts.length - 1] : chainParts[0];

  if (validator) fullCmd.push(...["--collator"]);

  const collatorPorts: PortsInterface = {
    "--port": 0,
    "--rpc-port": 0,
  };

  if (nodeSetup.args.length > 0) {
    let argsFullNode = null;
    let argsParachain = null;
    const splitIndex = nodeSetup.args.indexOf("--");

    if (splitIndex < 0) {
      argsParachain = nodeSetup.args;
    } else {
      argsParachain = nodeSetup.args.slice(0, splitIndex);
      argsFullNode = nodeSetup.args.slice(splitIndex + 1);
    }

    if (argsParachain) {
      for (const arg of argsParachain) {
        if (parachainAddedArgs[arg]) continue;

        // add
        debug(`adding ${arg}`);
        fullCmd.push(arg);
      }
    }

    // Arguments for the relay chain node part of the collator binary.
    fullCmd.push(
      ...[
        "--",
        "--base-path",
        relayDataPath,
        "--chain",
        `${cfgPath}/${relayChain}.json`,
        "--execution wasm",
      ],
    );

    if (argsFullNode) {
      // Add any additional flags to the CLI
      for (const [index, arg] of argsFullNode.entries()) {
        if (collatorPorts[arg] >= 0) {
          // port passed as argument, we need to ensure is not a default one because it will be
          // use by the parachain part.
          const selectedPort = parseInt(argsFullNode[index + 1], 10);
          if (
            [
              P2P_PORT,
              RPC_HTTP_PORT,
              RPC_WS_PORT,
              nodeSetup.p2pPort,
              nodeSetup.rpcPort,
              nodeSetup.wsPort,
            ].includes(selectedPort)
          ) {
            console.log(
              decorators.yellow(
                `WARN: default port configured, changing to use a random free port`,
              ),
            );
            const randomPort = await getRandomPort();
            collatorPorts[arg] = randomPort;
            argsFullNode[index + 1] = randomPort.toString();
          }
        }
      }

      // check ports
      for (const portArg of Object.keys(collatorPorts)) {
        if (collatorPorts[portArg] === 0) {
          const randomPort = await getRandomPort();
          argsFullNode.push(portArg);
          argsFullNode.push(randomPort.toString());
          debug(`Added ${portArg} with value ${randomPort}`);
        }
      }

      fullCmd = fullCmd.concat(argsFullNode);
      debug(`Added ${argsFullNode} to collator`);
    } else {
      // ensure ports
      for (const portArg of Object.keys(collatorPorts)) {
        if (collatorPorts[portArg] === 0) {
          const randomPort = await getRandomPort();
          fullCmd.push(portArg);
          fullCmd.push(randomPort.toString());
          debug(`Added ${portArg} with value ${randomPort}`);
        }
      }
    }
  } else {
    // no args
    // Arguments for the relay chain node part of the collator binary.
    fullCmd.push(
      ...["--", "--chain", `${cfgPath}/${relayChain}.json`, "--execution wasm"],
    );

    // ensure ports
    for (const portArg of Object.keys(collatorPorts)) {
      if (collatorPorts[portArg] === 0) {
        const randomPort = await getRandomPort();
        fullCmd.push(portArg);
        fullCmd.push(randomPort.toString());
        debug(`Added ${portArg} with value ${randomPort}`);
      }
    }
  }

  const resolvedCmd = [fullCmd.join(" ")];
  if (useWrapper) resolvedCmd.unshift("/cfg/zombie-wrapper.sh");
  return resolvedCmd;
}

export async function genCmd(
  nodeSetup: Node,
  cfgPath = "/cfg",
  dataPath = "/data",
  useWrapper = true,
): Promise<string[]> {
  const {
    name,
    key,
    chain,
    commandWithArgs,
    fullCommand,
    telemetry,
    telemetryUrl,
    prometheus,
    validator,
    bootnodes,
    zombieRole,
    jaegerUrl,
    parachainId,
  } = nodeSetup;

  let { command, args } = nodeSetup;

  // fullCommand is NOT decorated by the `zombie` wrapper
  // and is used internally in init containers.
  if (fullCommand) return ["bash", "-c", fullCommand];

  // command with args
  if (commandWithArgs) {
    return parseCmdWithArguments(commandWithArgs, useWrapper);
  }

  if (!command) command = DEFAULT_COMMAND;

  args = [...args];
  args.push("--no-mdns");

  if (key) args.push(...["--node-key", key]);

  if (!telemetry) args.push("--no-telemetry");
  else args.push(...["--telemetry-url", telemetryUrl]);

  if (prometheus && !args.includes("--prometheus-external"))
    args.push("--prometheus-external");

  if (jaegerUrl && zombieRole === ZombieRole.Node)
    args.push(...["--jaeger-agent", jaegerUrl]);

  if (validator && !args.includes("--validator")) args.push("--validator");

  if (zombieRole === ZombieRole.Collator && parachainId) {
    const parachainIdArgIndex = args.findIndex((arg) =>
      arg.includes("--parachain-id"),
    );
    args.splice(parachainIdArgIndex, 1);
    args.push(`--parachain-id ${parachainId}`);
  }

  if (bootnodes && bootnodes.length)
    args.push("--bootnodes", bootnodes.join(" "));

  const portFlags = getPortFlagsByCliArgsVersion(nodeSetup);

  for (const [k, v] of Object.entries(portFlags)) {
    args.push(...[k, v.toString()]);
  }

  const listenIndex = args.findIndex((arg) => arg === "--listen-addr");
  if (listenIndex >= 0) {
    const listenAddrParts = args[listenIndex + 1].split("/");
    listenAddrParts[4] = `${nodeSetup.p2pPort}`;
    const listenAddr = listenAddrParts.join("/");
    args[listenIndex + 1] = listenAddr;
  } else {
    // no --listen-add args
    args.push(...["--listen-addr", `/ip4/0.0.0.0/tcp/${nodeSetup.p2pPort}/ws`]);
  }

  // set our base path
  const basePathFlagIndex = args.findIndex((arg) => arg === "--base-path");
  if (basePathFlagIndex >= 0) args.splice(basePathFlagIndex, 2);
  args.push(...["--base-path", dataPath]);

  if(nodeSetup.substrateCliArgsVersion === SubstrateCliArgsVersion.V0) args.push("--unsafe-ws-external");

  const finalArgs: string[] = [
    command,
    "--chain",
    `${cfgPath}/${chain}.json`,
    "--name",
    name,
    "--rpc-cors",
    "all",
    "--unsafe-rpc-external",
    "--rpc-methods",
    "unsafe",
    ...args,
  ];

  const resolvedCmd = [finalArgs.join(" ")];
  if (useWrapper) resolvedCmd.unshift("/cfg/zombie-wrapper.sh");
  return resolvedCmd;
}


const getPortFlagsByCliArgsVersion = (nodeSetup: Node) => {
  // port flags logic
  const portFlags: {[key: string]: string} = {
    "--prometheus-port": (nodeSetup.prometheusPort ? nodeSetup.prometheusPort : PROMETHEUS_PORT).toString()
  };

  if(nodeSetup.substrateCliArgsVersion === SubstrateCliArgsVersion.V0) {
    portFlags["--rpc-port"] = (nodeSetup.rpcPort ? nodeSetup.rpcPort : RPC_HTTP_PORT).toString();
    portFlags["--ws-port"] = (nodeSetup.wsPort ? nodeSetup.wsPort : RPC_WS_PORT).toString();
  } else {
    // use ws port as default
    const portToUse = nodeSetup.wsPort ? nodeSetup.wsPort :
      nodeSetup.rpcPort ? nodeSetup.rpcPort :
      RPC_HTTP_PORT;
    portFlags["--rpc-port"] = portToUse.toString();
  }

  return portFlags;
}