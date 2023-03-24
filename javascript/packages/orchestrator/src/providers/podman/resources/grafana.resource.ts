import { getRandomPort, makeDir } from "@zombienet/utils";
import fs from "fs/promises";
import path from "path";
import { Client } from "../../client";

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
    const podSpec = this.generatePodSpec(containers, volumes);

    return podSpec;
  }

  private async createVolumeDirectories() {
    await makeDir(this.dataSourcesPath, true);
  }

  private async generateGrafanaConfig() {
    const templateConfigPath = path.resolve(__dirname, "./configs/grafana.yml");
    const grafanaConfigBuffer = await fs.readFile(templateConfigPath);

    let grafanaConfig = grafanaConfigBuffer.toString("utf8");
    grafanaConfig = grafanaConfig
      .replace("{{PROMETHEUS_IP}}", this.prometheusIp)
      .replace("{{TEMPO_IP}}", this.tempoIp);

    await fs.writeFile(`${this.dataSourcesPath}/prometheus.yml`, grafanaConfig);
  }

  private async generateVolumes() {
    await this.createVolumeDirectories();
    await this.generateGrafanaConfig();

    const dataSourcesVolume = {
      name: "datasources-cfg",
      hostPath: { type: "Directory", path: this.dataSourcesPath },
    };

    return [dataSourcesVolume];
  }

  private generateVolumesMounts() {
    const dataSourcesVolumeMount = {
      name: "datasources-cfg",
      mountPath: "/etc/grafana/provisioning/datasources",
      readOnly: false,
    };

    return [dataSourcesVolumeMount];
  }

  private async generateContainersPorts() {
    const grafanaWebPort = {
      containerPort: 3000,
      name: "grafana_web",
      hostPort: await getRandomPort(),
    };

    return [grafanaWebPort];
  }

  private generateContainers(volumeMounts: any, ports: any) {
    const grafanaContainerSpec = {
      image: "docker.io/grafana/grafana",
      name: "grafana",
      imagePullPolicy: "Always",
      ports,
      volumeMounts,
    };

    return [grafanaContainerSpec];
  }

  private generatePodSpec(containers: any[], volumes: any[]) {
    const grafanaPodSpec = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: "grafana_pod",
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

    return grafanaPodSpec;
  }
}
