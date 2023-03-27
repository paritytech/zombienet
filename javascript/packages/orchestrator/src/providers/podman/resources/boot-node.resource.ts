import { Node } from "../../../types";
import { Client } from "../../client";
import { NodeResource } from "./node.resource";

export class BootNodeResource extends NodeResource {
  constructor(client: Client, namespace: string, nodeSetupConfig: Node) {
    super(client, namespace, nodeSetupConfig);
  }

  protected generatePodSpec(containers: any[], volumes: any[]): any {
    const bootNodePodSpec = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: "bootnode_pod",
        namespace: this.namespace,
        labels: {
          "app.kubernetes.io/name": this.namespace,
          "app.kubernetes.io/instance": "bootnode",
          "zombie-role": "bootnode",
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

    return bootNodePodSpec;
  }
}
