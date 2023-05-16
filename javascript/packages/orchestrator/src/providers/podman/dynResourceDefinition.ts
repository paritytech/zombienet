import { getRandomPort } from "@zombienet/utils";
import { getUniqueName } from "../../configGenerator";
import { Network } from "../../network";
import { Node, ZombieRole } from "../../types";
import { getClient } from "../client";
import {
  BootNodeResource,
  GrafanaResource,
  IntrospectorResource,
  NodeResource,
  PrometheusResource,
  TempoResource,
} from "./resources";

export async function genBootnodeDef(
  namespace: string,
  nodeSetup: Node,
): Promise<any> {
  const client = getClient();
  const bootNodeResource = new BootNodeResource(client, namespace, nodeSetup);
  const bootNodeResourceSpec = bootNodeResource.generateSpec();

  return bootNodeResourceSpec;
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
  const node: Node = {
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
    zombieRole: ZombieRole.Temp,
    p2pPort: await getRandomPort(),
    wsPort: await getRandomPort(),
    rpcPort: await getRandomPort(),
    prometheusPort: await getRandomPort(),
  };

  return node;
}
