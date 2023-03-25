import { getRandomPort } from "@zombienet/utils";
import { INTROSPECTOR_POD_NAME } from "../../../constants";

export class IntrospectorResource {
  constructor(
    private readonly namespace: string,
    private readonly wsUri: string,
  ) {}

  public async generateSpec() {
    const containerPorts = await this.generateContainersPorts();
    const containers = this.generateContainers(containerPorts);
    const podSpec = this.generatePodSpec(containers);

    return podSpec;
  }

  private async generateContainersPorts() {
    const prometheusPort = {
      containerPort: 65432,
      name: "prometheus",
      hostPort: await getRandomPort(),
    };

    return [prometheusPort];
  }

  private generateContainers(ports: any) {
    const introspectorContainerSpec = {
      image: "docker.io/paritytech/polkadot-introspector:latest",
      name: INTROSPECTOR_POD_NAME,
      args: ["block-time-monitor", `--ws=${this.wsUri}`, "prometheus"],
      imagePullPolicy: "Always",
      ports,
      volumeMounts: [],
    };

    return [introspectorContainerSpec];
  }

  private generatePodSpec(containers: any[]) {
    const podSpec = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: `${INTROSPECTOR_POD_NAME}_pod`,
        namespace: this.namespace,
        labels: {
          "app.kubernetes.io/name": this.namespace,
          "app.kubernetes.io/instance": INTROSPECTOR_POD_NAME,
          "zombie-role": INTROSPECTOR_POD_NAME,
          app: "zombienet",
          "zombie-ns": this.namespace,
        },
      },
      spec: {
        hostname: INTROSPECTOR_POD_NAME,
        containers: containers,
        restartPolicy: "OnFailure",
      },
    };

    return podSpec;
  }
}
