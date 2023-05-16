import { Node, ZombieRole } from "../../../types";
import { Client } from "../../client";
import { NodeResource } from "./nodeResource";
import { Container, PodSpec, Volume } from "./types";

export class BootNodeResource extends NodeResource {
  constructor(client: Client, namespace: string, nodeSetupConfig: Node) {
    super(client, namespace, nodeSetupConfig);
  }

  protected generatePodSpec(
    containers: Container[],
    volumes: Volume[],
  ): PodSpec {
    return {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: "bootnode",
        namespace: this.namespace,
        labels: {
          "zombie-role": ZombieRole.BootNode,
          app: "zombienet",
          "zombie-ns": this.namespace,
        },
      },
      spec: {
        hostname: "bootnode",
        initContainers: [],
        restartPolicy: "OnFailure",
        volumes,
        containers,
      },
    };
  }
}
