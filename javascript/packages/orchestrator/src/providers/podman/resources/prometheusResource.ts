import { getRandomPort, makeDir } from "@zombienet/utils";
import fs from "fs/promises";
import path from "path";
import { Client } from "../../client";
import {
  Container,
  ContainerPort,
  PodSpec,
  Volume,
  VolumeMount,
} from "./types";

export class PrometheusResource {
  private readonly configPath: string;
  private readonly dataPath: string;

  constructor(client: Client, private readonly namespace: string) {
    const nodeRootPath = `${client.tmpDir}/prometheus`;
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
      throw new Error("Error creating directories for prometheus resource");
    }
  }

  private async generatePrometheusConfig() {
    try {
      const templateConfigPath = path.resolve(
        __dirname,
        "./configs/prometheus.yml",
      );
      await fs.copyFile(
        templateConfigPath,
        `${this.configPath}/prometheus.yml`,
      );
    } catch {
      throw new Error("Error generating config for prometheus resource");
    }
  }

  private async generateVolumes(): Promise<Volume[]> {
    await this.createVolumeDirectories();
    await this.generatePrometheusConfig();

    return [
      {
        name: "prom-cfg",
        hostPath: { type: "Directory", path: this.configPath },
      },
      {
        name: "prom-data",
        hostPath: { type: "Directory", path: this.dataPath },
      },
    ];
  }

  private generateVolumesMounts() {
    return [
      {
        name: "prom-cfg",
        mountPath: "/etc/prometheus",
        readOnly: false,
      },
      {
        name: "prom-data",
        mountPath: "/data",
        readOnly: false,
      },
    ];
  }

  private async generateContainersPorts(): Promise<ContainerPort[]> {
    return [
      {
        containerPort: 9090,
        name: "prometheus_endpoint",
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
        image: "docker.io/prom/prometheus",
        name: "prometheus",
        imagePullPolicy: "Always",
        ports,
        volumeMounts,
      },
    ];
  }

  private generatePodSpec(containers: Container[], volumes: Volume[]): PodSpec {
    return {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: "prometheus",
        namespace: this.namespace,
        labels: {
          "zombie-role": "prometheus",
          app: "zombienet",
          "zombie-ns": this.namespace,
        },
      },
      spec: {
        hostname: "prometheus",
        restartPolicy: "OnFailure",
        volumes,
        containers,
      },
    };
  }
}
