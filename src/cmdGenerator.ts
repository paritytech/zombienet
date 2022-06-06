import { decorators } from "./utils/colors";
import {
  DEFAULT_COMMAND,
  DEV_ACCOUNTS,
  P2P_PORT,
  PROMETHEUS_PORT,
  RPC_HTTP_PORT,
  RPC_WS_PORT,
} from "./constants";
import { Node } from "./types";
import { getRandomPort } from "./utils/net-utils";

const debug = require("debug")("zombie::cmdGenerator");

function parseCmdWithArguments(
  commandWithArgs: string,
  useWrapper = true
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
  command: string,
  nodeSetup: Node,
  cfgPath: string = "/cfg",
  dataPath: string = "/data",
  useWrapper = true,
  portFlags?: { [flag: string]: number }
): Promise<string[]> {
  const { name, args, chain, parachainId, key, validator } = nodeSetup;
  const parachainAddedArgs: any = {
    "--name": true,
    "--collator": true,
    "--force-authoring": true,
    "--base-path": true,
    "--port": true,
    "--ws-port": true,
    "--chain": true,
    "--prometheus-port": true
  };

  const colIndex = getCollatorIndex(parachainId!);
  let collatorPort;
  let collatorRpcPort;
  let collatorWsPort;
  let collatorPrometheusPort;
  if(portFlags) {
    if(portFlags["--port"]) collatorPort = portFlags["--port"];
    if(portFlags["--ws-port"]) collatorWsPort = portFlags["--ws-port"];
    if(portFlags["--prometheus-port"]) collatorPrometheusPort = portFlags["--prometheus-port"];
    if(portFlags["--rpc-port"]) collatorRpcPort = portFlags["--rpc-port"];
  }

  let fullCmd: string[] = [
    command,
    "--name",
    name,
    "--node-key",
    key!,
    "--chain",
    `${cfgPath}/${chain}-${parachainId}.json`,
    "--base-path",
    dataPath,
    "--listen-addr",
    `/ip4/0.0.0.0/tcp/${collatorPort ? collatorPort : P2P_PORT}/ws`,
    "--rpc-port",
    (collatorRpcPort ? collatorRpcPort : RPC_HTTP_PORT).toString(),
    "--ws-port",
    (collatorWsPort ? collatorWsPort : RPC_WS_PORT).toString(),
    "--prometheus-external",
    "--prometheus-port",
    (collatorPrometheusPort ? collatorPrometheusPort : PROMETHEUS_PORT).toString(),
    "--rpc-cors all",
    "--unsafe-rpc-external",
    "--rpc-methods unsafe",
    "--unsafe-ws-external"
  ];

  if(validator) fullCmd.push(...["--collator", "--force-authoring"]);

  const collatorPorts: any = {
    "--port": 0,
    "--ws-port": 0,
    "--rpc-port": 0,
  };

  if (nodeSetup.args.length > 0) {
    let argsFullNode = null;
    let argsParachain = null;
    let splitIndex = args ? args.findIndex((value) => value == "--") : -1;

    if (splitIndex < 0) {
      argsParachain = args;
    } else {
      argsParachain = args ? args.slice(0, splitIndex) : null;
      argsFullNode = args ? args.slice(splitIndex + 1) : null;
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
    fullCmd.push(...["--", "--chain", `${cfgPath}/${chain}.json`, "--execution wasm"]);

    if (argsFullNode) {
      // Add any additional flags to the CLI
      for (const [index, arg] of argsFullNode.entries()) {
        if (collatorPorts[arg] >= 0) {
          // port passed as argument, we need to ensure is not a default one because it will be
          // use by the parachain part.
          const selectedPort = parseInt(argsFullNode[index + 1], 10);
          if ([P2P_PORT, RPC_HTTP_PORT, RPC_WS_PORT].includes(selectedPort)) {
            console.log(
              decorators.yellow(
                `WARN: default port configured, changing to use a random free port`
              )
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
    fullCmd.push(...["--", "--chain", `${cfgPath}/${chain}.json`, "--execution wasm"]);

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
  cfgPath: string = "/cfg",
  dataPath: string = "/data",
  useWrapper = true,
  portFlags?: { [flag: string]: number }
): Promise<string[]> {
  let {
    name,
    key,
    chain,
    commandWithArgs,
    fullCommand,
    command,
    telemetry,
    telemetryUrl,
    prometheus,
    validator,
    bootnodes,
    args,
    zombieRole,
    jaegerUrl,
    parachainId
  } = nodeSetup;


  // fullCommand is NOT decorated by the `zombie` wrapper
  // and is used internally in init containers.
  if (fullCommand) return ["bash", "-c", fullCommand];

  // command with args
  if (commandWithArgs) {
    return parseCmdWithArguments(commandWithArgs);
  }

  if (!command) command = DEFAULT_COMMAND;

  args = [...args];
  args.push("--no-mdns");

  if (key) args.push(...["--node-key", key]);

  if (!telemetry) args.push("--no-telemetry");
  else args.push(...["--telemetry-url", telemetryUrl]);

  if (prometheus && ! args.includes("--prometheus-external")) args.push("--prometheus-external");

  if(jaegerUrl && zombieRole === "node") args.push(...["--jaeger-agent", jaegerUrl]);

  if (validator && ! args.includes("--validator")) args.push("--validator");

  if(zombieRole === "collator" && parachainId) {
    const parachainIdArgIndex = args.findIndex((arg) => arg.includes("--parachain-id"));
    args.splice(parachainIdArgIndex, 1);
    args.push(`--parachain-id ${parachainId}`);
  }

  if (bootnodes && bootnodes.length)
    args.push("--bootnodes", bootnodes.join(" "));

  if (portFlags) {
    // ensure port are set as desired
    for (const flag of Object.keys(portFlags)) {
      const index = args.findIndex((arg) => arg === flag);
      if (index < 0) args.push(...[flag, portFlags[flag].toString()]);
      else {
        args[index + 1] = portFlags[flag].toString();
      }
    }

    const port = portFlags["--port"];
    const listenIndex = args.findIndex((arg) => arg === "--listen-addr");
    if (listenIndex >= 0) {
      const parts = args[listenIndex + 1].split("/");
      parts[4] = port.toString();
      args[listenIndex + 1] = parts.join("/");
    } else {
      args.push(...["--listen-addr", `/ip4/0.0.0.0/tcp/${port}/ws`]);
    }

    const portFlagIndex = args.findIndex((arg) => arg === "--port");
    if (portFlagIndex >= 0) args.splice(portFlagIndex, 2);
  } else {
    // ensure listen on `ws`
    const listenIndex = args.findIndex((arg) => arg === "--listen-addr");
    if (listenIndex >= 0) args.splice(listenIndex, 2);
    args.push(...["--listen-addr", `/ip4/0.0.0.0/tcp/${P2P_PORT}/ws`]);
  }

  // set our base path
  const basePathFlagIndex = args.findIndex((arg) => arg === "--base-path");
  if (basePathFlagIndex >= 0) args.splice(basePathFlagIndex, 2);
  args.push(...["--base-path", dataPath]);

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
    "--unsafe-ws-external",
    ...args,
  ];

  const resolvedCmd = [finalArgs.join(" ")];
  if (useWrapper) resolvedCmd.unshift("/cfg/zombie-wrapper.sh");
  return resolvedCmd;
}

// helper
const parachainCollators: any = {};
function getCollatorIndex(paraId: number): number {
  if(parachainCollators[paraId] >= 0) parachainCollators[paraId] = parachainCollators[paraId] + 1;
  else  parachainCollators[paraId] = 0;

  return parachainCollators[paraId];
}
