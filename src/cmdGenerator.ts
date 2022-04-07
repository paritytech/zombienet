import { decorators } from "./utils/colors";
import {
  DEFAULT_COMMAND,
  DEV_ACCOUNTS,
  P2P_PORT,
  RPC_HTTP_PORT,
  RPC_WS_PORT,
} from "./constants";
import { Node } from "./types";
import { getRandomPort } from "./utils/net-utils";

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
  const { name, args, chain, parachainId, key, jaegerUrl } = nodeSetup;
  const parachainAddedArgs: any = {
    "--name": true,
    "--collator": true,
    "--force-authoring": true,
    "--base-path": true,
    "--port": true,
    "--ws-port": true,
    "--chain": true,
  };

  const colIndex = getCollatorIndex(name);
  let collatorPort;
  let collatorWsPort;
  if (portFlags) {
    collatorPort = portFlags["--port"];
    collatorWsPort = portFlags["--ws-port"];
  } else {
    collatorPort = await getRandomPort();
    collatorWsPort = await getRandomPort();
  }
  let fullCmd: string[] = [
    command,
    "--name",
    name,
    "--node-key",
    key!,
    `--${DEV_ACCOUNTS[colIndex]}`,
    "--collator",
    "--force-authoring",
    "--chain",
    `${cfgPath}/${chain}-${parachainId}.json`,
    "--base-path",
    dataPath,
    "--listen-addr",
    `/ip4/0.0.0.0/tcp/${collatorPort}/ws`,
    "--ws-port",
    collatorWsPort.toString(),
  ];

  if(jaegerUrl) args.push(...["--jaeger-agent", jaegerUrl]);

  const collatorPorts: any = {
    "--port": 0,
    "--ws-port": 0,
    "--rpc-port": 0,
  };

  if (nodeSetup.args.length > 0) {
    let argsCollator = null;
    let argsParachain = null;
    let splitIndex = args ? args.findIndex((value) => value == "--") : -1;

    if (splitIndex < 0) {
      argsParachain = args;
    } else {
      argsParachain = args ? args.slice(0, splitIndex) : null;
      argsCollator = args ? args.slice(splitIndex + 1) : null;
    }

    if (argsParachain) {
      for (const arg of argsParachain) {
        if (parachainAddedArgs[arg]) continue;

        // add
        console.log(`adding ${arg}`);
        fullCmd.push(arg);
      }
    }

    // Arguments for the relay chain node part of the collator binary.
    fullCmd.push(...["--", "--chain", `${cfgPath}/${chain}.json`]);

    if (argsCollator) {
      // Add any additional flags to the CLI
      for (const [index, arg] of argsCollator.entries()) {
        if (collatorPorts[arg] >= 0) {
          // port passed as argument, we need to ensure is not a default one because it will be
          // use by the parachain part.
          const selectedPort = parseInt(argsCollator[index + 1], 10);
          if ([P2P_PORT, RPC_HTTP_PORT, RPC_WS_PORT].includes(selectedPort)) {
            console.log(
              decorators.yellow(
                `WARN: default port configured, changing to use a random free port`
              )
            );
            const randomPort = await getRandomPort();
            collatorPorts[arg] = randomPort;
            argsCollator[index + 1] = randomPort.toString();
          }
        }
      }

      // check ports
      for (const portArg of Object.keys(collatorPorts)) {
        if (collatorPorts[portArg] === 0) {
          const randomPort = await getRandomPort();
          argsCollator.push(portArg);
          argsCollator.push(randomPort.toString());
          console.log(`Added ${portArg} with value ${randomPort}`);
        }
      }

      fullCmd = fullCmd.concat(argsCollator);
      console.log(`Added ${argsCollator} to collator`);
    } else {
      // ensure ports
      for (const portArg of Object.keys(collatorPorts)) {
        if (collatorPorts[portArg] === 0) {
          const randomPort = await getRandomPort();
          fullCmd.push(portArg);
          fullCmd.push(randomPort.toString());
          console.log(`Added ${portArg} with value ${randomPort}`);
        }
      }
    }
  } else {
    // no args

    // Arguments for the relay chain node part of the collator binary.
    fullCmd.push(...["--", "--chain", `${cfgPath}/${chain}.json`]);

    // ensure ports
    for (const portArg of Object.keys(collatorPorts)) {
      if (collatorPorts[portArg] === 0) {
        const randomPort = await getRandomPort();
        fullCmd.push(portArg);
        fullCmd.push(randomPort.toString());
        console.log(`Added ${portArg} with value ${randomPort}`);
      }
    }
  }

  if (useWrapper) fullCmd.unshift("/cfg/zombie-wrapper.sh");
  return [fullCmd.join(" ")];
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
    jaegerUrl
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

// helpers
function getCollatorIndex(name: string): number {
  const parts = name.split("-");
  const index = parseInt(parts[parts.length - 1], 10);
  return isNaN(index) ? 0 : index;
}
