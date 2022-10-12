import { getRandomPort } from "@zombienet/utils";
import { genCmd, genCumulusCollatorCmd } from "../../cmdGenerator";
import { getUniqueName } from "../../configGenerator";
import {
  P2P_PORT,
  PROMETHEUS_PORT,
  RPC_HTTP_PORT,
  RPC_WS_PORT,
} from "../../constants";
import { Network } from "../../network";
import { Node } from "../../types";
import { getClient } from "../client";

const fs = require("fs").promises;

export async function genBootnodeDef(
  namespace: string,
  nodeSetup: Node,
): Promise<any> {
  const client = getClient();
  const name = nodeSetup.name;
  const { rpcPort, wsPort, prometheusPort, p2pPort } = nodeSetup;
  const ports = await getPorts(rpcPort, wsPort, prometheusPort, p2pPort);

  const cfgPath = `${client.tmpDir}/${name}/cfg`;
  await fs.mkdir(cfgPath, { recursive: true });

  const dataPath = `${client.tmpDir}/${name}/data`;
  await fs.mkdir(dataPath, { recursive: true });

  const command = await genCmd(nodeSetup, cfgPath, dataPath, false);

  return {
    metadata: {
      name: "bootnode",
      namespace: namespace,
      labels: {
        name: namespace,
        instance: "bootnode",
        "zombie-role": "bootnode",
        app: "zombienet",
        "zombie-ns": namespace,
      },
    },
    spec: {
      cfgPath: `${client.tmpDir}/${nodeSetup.name}/cfg`,
      ports,
      command,
    },
  };
}

export async function genNodeDef(
  namespace: string,
  nodeSetup: Node,
): Promise<any> {
  const client = getClient();
  const name = nodeSetup.name;
  const { rpcPort, wsPort, prometheusPort, p2pPort } = nodeSetup;
  const ports = await getPorts(rpcPort, wsPort, prometheusPort, p2pPort);
  const cfgPath = `${client.tmpDir}/${name}/cfg`;
  await fs.mkdir(cfgPath, { recursive: true });

  const dataPath = `${client.tmpDir}/${name}/data`;
  await fs.mkdir(dataPath, { recursive: true });

  let computedCommand;
  if (nodeSetup.zombieRole === "cumulus-collator") {
    computedCommand = await genCumulusCollatorCmd(
      nodeSetup,
      cfgPath,
      dataPath,
      false,
    );
  } else {
    computedCommand = await genCmd(nodeSetup, cfgPath, dataPath, false);
  }

  return {
    metadata: {
      name: nodeSetup.name,
      namespace: namespace,
      labels: {
        "zombie-role": nodeSetup.zombieRole
          ? nodeSetup.zombieRole
          : nodeSetup.validator
          ? "authority"
          : "full-node",
        app: "zombienet",
        "zombie-ns": namespace,
        name: namespace,
        instance: nodeSetup.name,
      },
    },
    spec: {
      cfgPath,
      dataPath,
      ports,
      command: computedCommand,
    },
  };
}

async function getPorts(
  rpc?: number,
  ws?: number,
  prometheus?: number,
  p2p?: number,
) {
  const ports = [
    {
      containerPort: PROMETHEUS_PORT,
      name: "prometheus",
      flag: "--prometheus-port",
      hostPort: prometheus || (await getRandomPort()),
    },
    {
      containerPort: RPC_HTTP_PORT,
      name: "rpc",
      flag: "--rpc-port",
      hostPort: rpc || (await getRandomPort()),
    },
    {
      containerPort: RPC_WS_PORT,
      name: "ws",
      flag: "--ws-port",
      hostPort: ws || (await getRandomPort()),
    },
    {
      containerPort: P2P_PORT,
      name: "p2p",
      flag: "--port",
      hostPort: p2p || (await getRandomPort()),
    },
  ];

  return ports;
}

export function replaceNetworkRef(podDef: any, network: Network) {
  // replace command if needed
  if (Array.isArray(podDef.spec.command)) {
    const finalCommand = podDef.spec.command.map((item: string) =>
      network.replaceWithNetworInfo(item),
    );
    podDef.spec.command = finalCommand;
  } else {
    // string
    podDef.spec.command = network.replaceWithNetworInfo(podDef.spec.command);
  }
}

export async function createTempNodeDef(
  name: string,
  image: string,
  chain: string,
  fullCommand: string,
) {
  let node: Node = {
    name: getUniqueName("temp"),
    image,
    fullCommand: fullCommand,
    chain,
    validator: false,
    invulnerable: false,
    bootnodes: [],
    args: [],
    env: [],
    telemetryUrl: "",
    overrides: [],
    zombieRole: "temp",
    p2pPort: await getRandomPort(),
    wsPort: await getRandomPort(),
    rpcPort: await getRandomPort(),
    prometheusPort: await getRandomPort(),
  };

  return node;
}
