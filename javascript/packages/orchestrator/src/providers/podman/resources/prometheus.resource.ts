import { getRandomPort, makeDir } from "@zombienet/utils";
import fs from "fs/promises";
import path from "path";
import { Client } from "../../client";

export class PrometheusResource {
  private readonly configPath: string;
  private readonly dataPath: string;

  constructor(client: Client, private readonly namespace: string) {
    this.configPath = `${client.tmpDir}/prometheus/etc`;
    this.dataPath = `${client.tmpDir}/prometheus/data`;
  }

  public async generateSpec() {
    const volumes = await this.generateVolumes();
    const volumeMounts = this.generateVolumesMounts();
    const containersPorts = await this.generateContainersPorts();
    const containers = this.generateContainers(volumeMounts, containersPorts);
    const podSpec = this.generatePodSpec(containers, volumes);

    return podSpec;
  }

  private async createVolumeDirectories() {
    await makeDir(this.configPath, true);
    await makeDir(this.dataPath, true);
  }

  private async generatePrometheusConfig() {
    const templateConfigPath = path.resolve(
      __dirname,
      "./configs/prometheus.yml",
    );
    await fs.copyFile(templateConfigPath, `${this.configPath}/prometheus.yml`);
  }

  private async generateVolumes() {
    await this.createVolumeDirectories();
    await this.generatePrometheusConfig();

    const configVolume = {
      name: "prom-cfg",
      hostPath: { type: "Directory", path: this.configPath },
    };
    const dataVolume = {
      name: "prom-data",
      hostPath: { type: "Directory", path: this.dataPath },
    };

    return [configVolume, dataVolume];
  }

  private generateVolumesMounts() {
    const configVolumeMount = {
      name: "prom-cfg",
      mountPath: "/etc/prometheus",
      readOnly: false,
    };
    const dataVolumeMount = {
      name: "prom-data",
      mountPath: "/data",
      readOnly: false,
    };

    return [configVolumeMount, dataVolumeMount];
  }

  private async generateContainersPorts() {
    const prometheusPort = {
      containerPort: 9090,
      name: "prometheus_endpoint",
      hostPort: await getRandomPort(),
    };

    return [prometheusPort];
  }

  private generateContainers(volumeMounts: any, ports: any) {
    const prometheusContainerSpec = {
      image: "docker.io/prom/prometheus",
      name: "prometheus",
      imagePullPolicy: "Always",
      ports,
      volumeMounts,
    };

    return [prometheusContainerSpec];
  }

  private generatePodSpec(containers: any[], volumes: any[]) {
    const podSpec = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: "prometheus_pod",
        namespace: this.namespace,
        labels: {
          "app.kubernetes.io/name": this.namespace,
          "app.kubernetes.io/instance": "prometheus",
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

    return podSpec;
  }
}
