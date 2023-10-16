import { Node, ZombieRole } from "../../../sharedTypes";
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
          "x-infra-instance": process.env.X_INFRA_INSTANCE || "ondemand"
        },
      },
      spec: {
        hostname: "bootnode",
        containers,
        initContainers,
        restartPolicy: "Always",
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
