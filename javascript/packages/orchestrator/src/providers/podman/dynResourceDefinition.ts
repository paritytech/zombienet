import { getRandomPort, makeDir } from "@zombienet/utils";
import { resolve } from "path";
import { genCmd, genCumulusCollatorCmd } from "../../cmdGenerator";
import { getUniqueName } from "../../configGenerator";
import {
  INTROSPECTOR_POD_NAME,
  P2P_PORT,
  PROMETHEUS_PORT,
  RPC_HTTP_PORT,
  RPC_WS_PORT,
} from "../../constants";
import { Network } from "../../network";
import { Node } from "../../types";
import { getClient } from "../client";
import { GrafanaResource, IntrospectorResource, NodeResource, PrometheusResource, TempoResource } from "./resources";

const fs = require("fs").promises;

export async function genBootnodeDef(
  namespace: string,
  nodeSetup: Node,
): Promise<any> {
  const [volume_mounts, devices] = await make_volume_mounts(nodeSetup.name);
  const container = await make_main_container(nodeSetup, volume_mounts);
  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: "bootnode",
      namespace: namespace,
      labels: {
        "app.kubernetes.io/name": namespace,
        "app.kubernetes.io/instance": "bootnode",
        "zombie-role": "bootnode",
        app: "zombienet",
        "zombie-ns": namespace,
      },
    },
    spec: {
      hostname: "bootnode",
      containers: [container],
      initContainers: [],
      restartPolicy: "OnFailure",
      volumes: devices,
    },
  };
}

export async function genPrometheusDef(namespace: string): Promise<any> {
  const client = getClient();
  const prometheusResource = new PrometheusResource(client, namespace);
  const prometheusResourceSpec = prometheusResource.generateSpec();

  return prometheusResourceSpec;
}

export async function genGrafanaDef(
  namespace: string,
  prometheusIp: string,
  tempoIp: string,
): Promise<any> {
  const client = getClient();
  const grafanaResource = new GrafanaResource(
    client,
    namespace,
    prometheusIp,
    tempoIp,
  );
  const grafanaResourceSpec = grafanaResource.generateSpec();

  return grafanaResourceSpec;
}

export async function getIntrospectorDef(
  namespace: string,
  wsUri: string,
): Promise<any> {
  const introspectorResource = new IntrospectorResource(namespace, wsUri);
  const introspectorResourceSpec = introspectorResource.generateSpec();

  return introspectorResourceSpec;
}

export async function genTempoDef(namespace: string): Promise<any> {
  const client = getClient();
  const tempoResource = new TempoResource(client, namespace);
  const tempoResourceSpec = tempoResource.generateSpec();

  return tempoResourceSpec;
}

export async function genNodeDef(
  namespace: string,
  nodeSetup: Node,
): Promise<any> {
  const client = getClient();
  const nodeResource = new NodeResource(client, namespace, nodeSetup);
  const nodeResourceSpec = nodeResource.generateSpec();

  return nodeResourceSpec;
}

async function make_volume_mounts(name: string): Promise<[any, any]> {
  const volume_mounts = [
    { name: "tmp-cfg", mountPath: "/cfg:U", readOnly: false },
    { name: "tmp-data", mountPath: "/data:U", readOnly: false },
    { name: "tmp-relay-data", mountPath: "/relay-data:U", readOnly: false },
  ];

  const client = getClient();
  const cfgPath = `${client.tmpDir}/${name}/cfg`;
  const dataPath = `${client.tmpDir}/${name}/data`;
  const relayDataPath = `${client.tmpDir}/${name}/relay-data`;
  await makeDir(cfgPath, true);
  await makeDir(dataPath, true);
  await makeDir(relayDataPath, true);

  const devices = [
    { name: "tmp-cfg", hostPath: { type: "Directory", path: cfgPath } },
    { name: "tmp-data", hostPath: { type: "Directory", path: dataPath } },
    {
      name: "tmp-relay-data",
      hostPath: { type: "Directory", path: relayDataPath },
    },
  ];

  return [volume_mounts, devices];
}

async function make_main_container(
  nodeSetup: Node,
  volume_mounts: any[],
): Promise<any> {
  // @ts-ignore
  const { rpcPort, wsPort, prometheusPort, p2pPort } = nodeSetup.externalPorts
    ? nodeSetup.externalPorts
    : {};
  const ports = [
    {
      containerPort: PROMETHEUS_PORT,
      name: "prometheus",
      hostPort: prometheusPort || (await getRandomPort()),
    },
    {
      containerPort: RPC_HTTP_PORT,
      name: "rpc",
      hostPort: rpcPort || (await getRandomPort()),
    },
    {
      containerPort: RPC_WS_PORT,
      name: "rpc-ws",
      hostPort: wsPort || (await getRandomPort()),
    },
    {
      containerPort: P2P_PORT,
      name: "p2p",
      hostPort: p2pPort || (await getRandomPort()),
    },
  ];

  let computedCommand;
  if (nodeSetup.zombieRole === "cumulus-collator") {
    computedCommand = await genCumulusCollatorCmd(nodeSetup);
  } else {
    computedCommand = await genCmd(nodeSetup);
  }

  let containerDef = {
    image: nodeSetup.image,
    name: nodeSetup.name,
    imagePullPolicy: "Always",
    ports,
    env: nodeSetup.env,
    volumeMounts: volume_mounts,
    command: computedCommand,
  };

  return containerDef;
}

export function replaceNetworkRef(podDef: any, network: Network) {
  // replace command if needed in containers
  for (const container of podDef.spec.containers) {
    if (Array.isArray(container.command)) {
      const finalCommand = container.command.map((item: string) =>
        network.replaceWithNetworInfo(item),
      );
      container.command = finalCommand;
    } else {
      container.command = network.replaceWithNetworInfo(container.command);
    }
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
