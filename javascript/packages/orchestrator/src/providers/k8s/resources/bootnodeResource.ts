import { Node, ZombieRole } from "../../../types";
import { NodeResource } from "./nodeResource";
import { Container, PodSpec, Volume } from "./types";

export class BootNodeResource extends NodeResource {
  constructor(namespace: string, nodeSetupConfig: Node) {
    super(namespace, nodeSetupConfig);
  }

  protected generatePodSpec(
    initContainers: Container[],
    containers: Container[],
    volumes: Volume[],
  ): PodSpec {
    return {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: "bootnode",
        labels: {
          "app.kubernetes.io/name": this.namespace,
          "app.kubernetes.io/instance": "bootnode",
          "zombie-role": ZombieRole.BootNode,
          app: "zombienet",
          "zombie-ns": this.namespace,
        },
      },
      spec: {
        hostname: "bootnode",
        containers,
        initContainers,
        restartPolicy: "Never",
        volumes,
        securityContext: {
          fsGroup: 1000,
          runAsUser: 1000,
          runAsGroup: 1000,
        },
      },
    };
  }
}
