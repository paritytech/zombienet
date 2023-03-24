import { getRandomPort, makeDir } from "@zombienet/utils";
import fs from "fs/promises";
import path from "path";
import { Client } from "../../client";

export class TempoResource {
  private readonly configPath: string;
  private readonly dataPath: string;

  constructor(client: Client, private readonly namespace: string) {
    this.configPath = `${client.tmpDir}/tempo/etc`;
    this.dataPath = `${client.tmpDir}/tempo/data`;
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

  private async generateTempoConfig() {
    const templateConfigPath = path.resolve(__dirname, `./configs/tempo.yaml`);
    await fs.copyFile(templateConfigPath, `${this.configPath}/tempo.yaml`);
  }

  private async generateVolumes() {
    await this.createVolumeDirectories();
    await this.generateTempoConfig();

    const configVolume = {
      name: "tempo-cfg",
      hostPath: { type: "Directory", path: this.configPath },
    };
    const dataVolume = {
      name: "tempo-data",
      hostPath: { type: "Directory", path: this.dataPath },
    };

    return [configVolume, dataVolume];
  }

  private generateVolumesMounts() {
    const configVolumeMount = {
      name: "tempo-cfg",
      mountPath: "/etc/tempo",
      readOnly: false,
    };
    const dataVolumeMount = {
      name: "tempo-data",
      mountPath: "/data",
      readOnly: false,
    };

    return [configVolumeMount, dataVolumeMount];
  }

  private async generateContainersPorts() {
    const tempoPort = {
      containerPort: 3100,
      name: "tempo",
      hostPort: await getRandomPort(),
    };
    const jaegerIngestPort = {
      containerPort: 14268,
      name: "jaeger_ingest",
      hostPort: await getRandomPort(),
    };
    const otlpGrpcPort = {
      containerPort: 4317,
      name: "otlp_grpc",
      hostPort: await getRandomPort(),
    };
    const otlpHttpPort = {
      containerPort: 4318,
      name: "otlp_http",
      hostPort: await getRandomPort(),
    };
    const zipkinPort = {
      containerPort: 9411,
      name: "zipkin",
      hostPort: await getRandomPort(),
    };

    return [
      tempoPort,
      jaegerIngestPort,
      otlpGrpcPort,
      otlpHttpPort,
      zipkinPort,
    ];
  }

  private generateContainers(volumeMounts: any, ports: any) {
    const tempoContainerSpec = {
      image: "docker.io/grafana/tempo:latest",
      name: "tempo",
      args: ["-config.file=/etc/tempo/tempo.yaml"],
      imagePullPolicy: "Always",
      ports,
      volumeMounts,
    };

    return [tempoContainerSpec];
  }

  private generatePodSpec(containers: any[], volumes: any[]) {
    const podSpec = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: "tempo_pod",
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

    return podSpec;
  }
}
