import { getRandomPort, getSha256 } from "@zombienet/utils";
import { getUniqueName } from "../../configGenerator";
import { TMP_DONE, WAIT_UNTIL_SCRIPT_SUFIX } from "../../constants";
import { Network } from "../../network";
import { Node } from "../../types";
import { BootNodeResource, NodeResource } from "./resources";

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
    zombieRole: "temp",
    p2pPort: await getRandomPort(),
    wsPort: await getRandomPort(),
    rpcPort: await getRandomPort(),
    prometheusPort: await getRandomPort(),
  };

  return node;
}
