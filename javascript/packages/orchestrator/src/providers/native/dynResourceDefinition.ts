import { getRandomPort } from "@zombienet/utils";
import { getUniqueName } from "../../configGenerator";
import { Network } from "../../network";
import { Node } from "../../types";
import { getClient } from "../client";
import { BootNodeResource, NodeResource } from "./resources";

export async function genBootnodeDef(
  namespace: string,
  nodeSetup: Node,
): Promise<any> {
  const client = getClient();
  const bootNodeResource = new BootNodeResource(client, namespace, nodeSetup);

  return bootNodeResource.generateSpec();
}

export async function genNodeDef(
  namespace: string,
  nodeSetup: Node,
): Promise<any> {
  const client = getClient();
  const nodeResource = new NodeResource(client, namespace, nodeSetup);

  return nodeResource.generateSpec();
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
    zombieRole: "temp",
    p2pPort: await getRandomPort(),
    wsPort: await getRandomPort(),
    rpcPort: await getRandomPort(),
    prometheusPort: await getRandomPort(),
  };

  return node;
}
