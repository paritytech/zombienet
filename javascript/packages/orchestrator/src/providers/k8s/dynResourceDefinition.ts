import { getRandomPort, getSha256 } from "@zombienet/utils";
import { getUniqueName } from "../../configGenerator";
import { TMP_DONE, WAIT_UNTIL_SCRIPT_SUFIX } from "../../constants";
import { Network } from "../../network";
import { Node, ZombieRole } from "../../types";
import { BootNodeResource, NodeResource, ServiceResource } from "./resources";
import { PodSpec, ServiceSpec } from "./resources/types";

export async function genBootnodeDef(
  namespace: string,
  nodeSetup: Node,
): Promise<any> {
  const bootNodeResource = new BootNodeResource(namespace, nodeSetup);
  return bootNodeResource.generateSpec();
}

export async function genNodeDef(
  namespace: string,
  nodeSetup: Node,
): Promise<any> {
  const nodeResource = new NodeResource(namespace, nodeSetup);
  return nodeResource.generateSpec();
}

export function genServiceDef(podSpec: PodSpec): ServiceSpec {
  const serviceResource = new ServiceResource(podSpec);
  return serviceResource.generateSpec();
};

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
  const nodeName = getUniqueName("temp");
  const node: Node = {
    name: nodeName,
    key: getSha256(nodeName),
    image,
    fullCommand:
      fullCommand + " && " + TMP_DONE + " && " + WAIT_UNTIL_SCRIPT_SUFIX, // leave the pod runnig until we finish transfer files
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
