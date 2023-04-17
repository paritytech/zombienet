import { getRandomPort, makeDir } from "@zombienet/utils";
import { genCmd, genCumulusCollatorCmd } from "../../../cmdGenerator";
import {
  P2P_PORT,
  PROMETHEUS_PORT,
  RPC_HTTP_PORT,
  RPC_WS_PORT,
} from "../../../constants";
import { Node, ZombieRole } from "../../../types";
import { Client } from "../../client";
import {
  Container,
  ContainerPort,
  PodSpec,
  Volume,
  VolumeMount,
} from "./types";

export class NodeResource {
  private readonly configPath: string;
  private readonly dataPath: string;
  private readonly relayDataPath: string;

  constructor(
    client: Client,
    protected readonly namespace: string,
    protected readonly nodeSetupConfig: Node,
  ) {
    const nodeRootPath = `${client.tmpDir}/${nodeSetupConfig.name}`;
    this.configPath = `${nodeRootPath}/cfg`;
    this.dataPath = `${nodeRootPath}/data`;
    this.relayDataPath = `${nodeRootPath}/relay-data`;
  }

  public async generateSpec() {
    const volumes = await this.generateVolumes();
    const volumeMounts = this.generateVolumesMounts();
    const containersPorts = await this.generateContainersPorts();
    const containers = await this.generateContainers(
      volumeMounts,
      containersPorts,
    );

    return this.generatePodSpec(containers, volumes);
  }

  private async createVolumeDirectories() {
    try {
      await makeDir(this.configPath, true);
      await makeDir(this.dataPath, true);
      await makeDir(this.relayDataPath, true);
    } catch {
      throw new Error(
        `Error generating directories for ${this.nodeSetupConfig.name} resource`,
      );
    }
  }

  private async generateVolumes(): Promise<Volume[]> {
    await this.createVolumeDirectories();

    return [
      {
        name: "tmp-cfg",
        hostPath: { type: "Directory", path: this.configPath },
      },
      {
        name: "tmp-data",
        hostPath: { type: "Directory", path: this.dataPath },
      },
      {
        name: "tmp-relay-data",
        hostPath: { type: "Directory", path: this.relayDataPath },
      },
    ];
  }

  private generateVolumesMounts() {
    return [
      {
        name: "tmp-cfg",
        mountPath: "/cfg:U",
        readOnly: false,
      },
      {
        name: "tmp-data",
        mountPath: "/data:U",
        readOnly: false,
      },
      {
        name: "tmp-relay-data",
        mountPath: "/relay-data:U",
        readOnly: false,
      },
    ];
  }

  private async portFromNodeSetupConfigOrDefault(
    portProperty: keyof NonNullable<Node["externalPorts"]>,
  ) {
    const { externalPorts } = this.nodeSetupConfig;

    if (externalPorts && portProperty in externalPorts) {
      return externalPorts[portProperty];
    }

    return getRandomPort();
  }

  private async generateContainersPorts(): Promise<ContainerPort[]> {
    return [
      {
        containerPort: PROMETHEUS_PORT,
        name: "prometheus",
        hostPort: await this.portFromNodeSetupConfigOrDefault("prometheusPort"),
      },
      {
        containerPort: RPC_HTTP_PORT,
        name: "rpc",
        hostPort: await this.portFromNodeSetupConfigOrDefault("rpcPort"),
      },
      {
        containerPort: RPC_WS_PORT,
        name: "rpc-ws",
        hostPort: await this.portFromNodeSetupConfigOrDefault("wsPort"),
      },
      {
        containerPort: P2P_PORT,
        name: "p2p",
        hostPort: await this.portFromNodeSetupConfigOrDefault("p2pPort"),
      },
    ];
  }

  private generateContainerCommand(): Promise<string[]> {
    if (this.nodeSetupConfig.zombieRole === ZombieRole.CumulusCollator) {
      return genCumulusCollatorCmd(this.nodeSetupConfig);
    }

    return genCmd(this.nodeSetupConfig);
  }

  private async generateContainers(
    volumeMounts: VolumeMount[],
    ports: ContainerPort[],
  ): Promise<Container[]> {
    return [
      {
        image: this.nodeSetupConfig.image,
        name: this.nodeSetupConfig.name,
        imagePullPolicy: "Always",
        env: this.nodeSetupConfig.env,
        volumeMounts,
        ports,
        command: await this.generateContainerCommand(),
      },
    ];
  }

  protected generatePodSpec(
    containers: Container[],
    volumes: Volume[],
  ): PodSpec {
    const { name, validator } = this.nodeSetupConfig;

    return {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: name,
        namespace: this.namespace,
        labels: {
          "zombie-role": validator ? "authority" : "full-node",
          app: "zombienet",
          "zombie-ns": this.namespace,
        },
        annotations: {
          "prometheus.io/scrape": "true",
          "prometheus.io/port": `${PROMETHEUS_PORT}`,
        },
      },
      spec: {
        hostname: name,
        initContainers: [],
        restartPolicy: "OnFailure",
        volumes,
        containers,
      },
    };
  }
}
