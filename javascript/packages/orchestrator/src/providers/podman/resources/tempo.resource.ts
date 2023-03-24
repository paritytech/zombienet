import { getRandomPort, makeDir } from "@zombienet/utils";
import fs from "fs/promises";
import path from "path";
import { Client } from "../../client";
import { Container, ContainerPort, Volume, VolumeMount } from "./types";

export class TempoResource {
  private readonly configPath: string;
  private readonly dataPath: string;

  constructor(client: Client, private readonly namespace: string) {
    const nodeRootPath = `${client.tmpDir}/tempo`;
    this.configPath = `${nodeRootPath}/etc`;
    this.dataPath = `${nodeRootPath}/data`;
  }

  public async generateSpec() {
    const volumes = await this.generateVolumes();
    const volumeMounts = this.generateVolumesMounts();
    const containersPorts = await this.generateContainersPorts();
    const containers = this.generateContainers(volumeMounts, containersPorts);

    return this.generatePodSpec(containers, volumes);
  }

  private async createVolumeDirectories() {
    try {
      await makeDir(this.configPath, true);
      await makeDir(this.dataPath, true);
    } catch {
      throw new Error("Error creating directories for tempo resource");
    }
  }

  private async generateTempoConfig() {
    try {
      const templateConfigPath = path.resolve(
        __dirname,
        `./configs/tempo.yaml`,
      );
      await fs.copyFile(templateConfigPath, `${this.configPath}/tempo.yaml`);
    } catch {
      throw new Error("Error generating config for tempo resource");
    }
  }

  private async generateVolumes(): Promise<Volume[]> {
    await this.createVolumeDirectories();
    await this.generateTempoConfig();

    return [
      {
        name: "tempo-cfg",
        hostPath: { type: "Directory", path: this.configPath },
      },
      {
        name: "tempo-data",
        hostPath: { type: "Directory", path: this.dataPath },
      },
    ];
  }

  private generateVolumesMounts() {
    return [
      {
        name: "tempo-cfg",
        mountPath: "/etc/tempo",
        readOnly: false,
      },
      {
        name: "tempo-data",
        mountPath: "/data",
        readOnly: false,
      },
    ];
  }

  private async generateContainersPorts(): Promise<ContainerPort[]> {
    return [
      {
        containerPort: 3100,
        name: "tempo",
        hostPort: await getRandomPort(),
      },
      {
        containerPort: 14268,
        name: "jaeger_ingest",
        hostPort: await getRandomPort(),
      },
      {
        containerPort: 4317,
        name: "otlp_grpc",
        hostPort: await getRandomPort(),
      },
      {
        containerPort: 4318,
        name: "otlp_http",
        hostPort: await getRandomPort(),
      },
      {
        containerPort: 9411,
        name: "zipkin",
        hostPort: await getRandomPort(),
      },
    ];
  }

  private generateContainers(
    volumeMounts: VolumeMount[],
    ports: ContainerPort[],
  ): Container[] {
    return [
      {
        image: "docker.io/grafana/tempo:latest",
        name: "tempo",
        args: ["-config.file=/etc/tempo/tempo.yaml"],
        imagePullPolicy: "Always",
        ports,
        volumeMounts,
      },
    ];
  }

  private generatePodSpec(containers: Container[], volumes: Volume[]) {
    return {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: "tempo",
        namespace: this.namespace,
        labels: {
          "app.kubernetes.io/name": this.namespace,
          "app.kubernetes.io/instance": "tempo",
          "zombie-role": "tempo",
          app: "zombienet",
          "zombie-ns": this.namespace,
        },
      },
      spec: {
        hostname: "tempo",
        restartPolicy: "OnFailure",
        volumes,
        containers,
      },
    };
  }
}
