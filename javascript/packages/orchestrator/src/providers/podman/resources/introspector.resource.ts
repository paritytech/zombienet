import { getRandomPort } from "@zombienet/utils";
import { INTROSPECTOR_POD_NAME } from "../../../constants";
import { Container, ContainerPort, PodSpec } from "./types";

export class IntrospectorResource {
  constructor(
    private readonly namespace: string,
    private readonly wsUri: string,
  ) {}

  public async generateSpec() {
    const containerPorts = await this.generateContainersPorts();
    const containers = this.generateContainers(containerPorts);

    return this.generatePodSpec(containers);
  }

  private async generateContainersPorts(): Promise<ContainerPort[]> {
    return [
      {
        containerPort: 65432,
        name: "prometheus",
        hostPort: await getRandomPort(),
      },
    ];
  }

  private generateContainers(ports: ContainerPort[]): Container[] {
    return [
      {
        image: "docker.io/paritytech/polkadot-introspector:latest",
        name: INTROSPECTOR_POD_NAME,
        args: ["block-time-monitor", `--ws=${this.wsUri}`, "prometheus"],
        imagePullPolicy: "Always",
        ports,
        volumeMounts: [],
      },
    ];
  }

  private generatePodSpec(containers: Container[]): PodSpec {
    return {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: INTROSPECTOR_POD_NAME,
        namespace: this.namespace,
        labels: {
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
  }
}
