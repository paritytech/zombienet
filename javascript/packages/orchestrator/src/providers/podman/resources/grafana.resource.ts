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

export class GrafanaResource {
  private readonly dataSourcesPath: string;

  constructor(
    client: Client,
    private readonly namespace: string,
    private readonly prometheusIp: string,
    private readonly tempoIp: string,
  ) {
    this.dataSourcesPath = `${client.tmpDir}/grafana/datasources`;
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
      await makeDir(this.dataSourcesPath, true);
    } catch {
      throw new Error("Error creating directory for grafana resource");
    }
  }

  private async generateGrafanaConfig() {
    try {
      const templateConfigPath = path.resolve(
        __dirname,
        "./configs/grafana.yml",
      );
      const grafanaConfigBuffer = await fs.readFile(templateConfigPath);

      let grafanaConfig = grafanaConfigBuffer.toString("utf8");
      grafanaConfig = grafanaConfig
        .replace("{{PROMETHEUS_IP}}", this.prometheusIp)
        .replace("{{TEMPO_IP}}", this.tempoIp);

      await fs.writeFile(
        `${this.dataSourcesPath}/prometheus.yml`,
        grafanaConfig,
      );
    } catch {
      throw new Error("Error generating config for grafana resource");
    }
  }

  private async generateVolumes(): Promise<Volume[]> {
    await this.createVolumeDirectories();
    await this.generateGrafanaConfig();

    return [
      {
        name: "datasources-cfg",
        hostPath: { type: "Directory", path: this.dataSourcesPath },
      },
    ];
  }

  private generateVolumesMounts() {
    return [
      {
        name: "datasources-cfg",
        mountPath: "/etc/grafana/provisioning/datasources",
        readOnly: false,
      },
    ];
  }

  private async generateContainersPorts(): Promise<ContainerPort[]> {
    return [
      {
        containerPort: 3000,
        name: "grafana_web",
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
        image: "docker.io/grafana/grafana",
        name: "grafana",
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
        name: "grafana",
        namespace: this.namespace,
        labels: {
          "app.kubernetes.io/name": this.namespace,
          "app.kubernetes.io/instance": "grafana",
          "zombie-role": "grafana",
          app: "zombienet",
          "zombie-ns": this.namespace,
        },
      },
      spec: {
        hostname: "grafana",
        restartPolicy: "OnFailure",
        volumes,
        containers,
      },
    };
  }
}
