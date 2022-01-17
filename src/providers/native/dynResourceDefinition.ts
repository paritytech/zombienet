import { genCmd } from "../../cmdGenerator";
import {
  PROMETHEUS_PORT,
  getUniqueName,
  RPC_HTTP_PORT,
  P2P_PORT,
  RPC_WS_PORT,
} from "../../configManager";
import { Node } from "../../types";
import { getRandomPort } from "../../utils";
import { getClient } from "../client";

const fs = require("fs").promises;

export async function genBootnodeDef(
  namespace: string,
  nodeSetup: Node
): Promise<any> {
  const client = getClient();
  const name = nodeSetup.name;
  const ports = await getPorts();
  const portFlags = getPortFlags(ports);

  const cfgPath = `${client.tmpDir}/${name}/cfg`;
  await fs.mkdir(cfgPath, { recursive: true });

  const command = await genCmd(nodeSetup, cfgPath, false, portFlags);


  return {
    metadata: {
      name: "bootnode",
      namespace: namespace,
      labels: {
        "name": namespace,
        "instance": "bootnode",
        "zombie-role": "bootnode",
        app: "zombienet",
        "zombie-ns": namespace,
      },
    },
    spec: {
      cfgPath: `${client.tmpDir}/${nodeSetup.name}/cfg`,
      ports,
      command
    }
  }
}

export async function genNodeDef(
  namespace: string,
  nodeSetup: Node
): Promise<any> {
  const client = getClient();
  const name = nodeSetup.name;
  const ports = await getPorts();
  const portFlags = getPortFlags(ports);

  const cfgPath = `${client.tmpDir}/${name}/cfg`;
  await fs.mkdir(cfgPath, { recursive: true });

  const command = await genCmd(nodeSetup, cfgPath, false, portFlags);

  return {
    metadata: {
      name: nodeSetup.name,
      namespace: namespace,
      labels: {
        "zombie-role": nodeSetup.zombieRole ? nodeSetup.zombieRole :
          nodeSetup.validator ? "authority" :
          "full-node",
        app: "zombienet",
        "zombie-ns": namespace,
        "name": namespace,
        "instance": nodeSetup.name,
      }
    },
    spec: {
      cfgPath,
      ports,
      command
    }
  }
}

async function getPorts() {
  const ports = [
    {
      containerPort: PROMETHEUS_PORT,
      name: "prometheus",
      flag: "--prometheus-port",
      hostPort: await getRandomPort()
    },
    {
      containerPort: RPC_HTTP_PORT, name: "rpc", flag: "--rpc-port", hostPort: await getRandomPort()
    },
    {
      containerPort: RPC_WS_PORT, name: "ws", flag: "--ws-port", hostPort: await getRandomPort()
    },
    { containerPort: P2P_PORT, name: "p2p", flag: "--port", hostPort: await getRandomPort() } //p2p
  ];

  return ports
}

function getPortFlags(ports: any): {[flag: string]: number} {
  const portFlags = ports.reduce((memo: any, portItem: any) => {
    memo[portItem.flag] = portItem.hostPort;
    return memo;
  }, {});
  return portFlags;
}

export function createTempNodeDef(
  name: string,
  image: string,
  chain: string,
  fullCommand: string
) {
  let node: Node = {
    name: getUniqueName("temp"),
    image,
    fullCommand: fullCommand,
    chain,
    validator: false,
    bootnodes: [],
    args: [],
    env: [],
    telemetryUrl: "",
    overrides: [],
    zombieRole: "temp"
  };

  return node;
}
