import { getRandomPort, makeDir } from "@zombienet/utils";
import { genCmd, genCumulusCollatorCmd } from "../../../cmdGenerator";
import {
  P2P_PORT,
  PROMETHEUS_PORT,
  RPC_HTTP_PORT,
  RPC_WS_PORT,
} from "../../../constants";
import { Node } from "../../../types";
import { Client } from "../../client";

export class NodeResource {
  private readonly configPath: string;
  private readonly dataPath: string;
  private readonly relayDataPath: string;

  constructor(
    client: Client,
    protected readonly namespace: string,
    protected readonly nodeSetupConfig: Node,
  ) {
    const nodeName = nodeSetupConfig.name;
    this.configPath = `${client.tmpDir}/${nodeName}/cfg`;
    this.dataPath = `${client.tmpDir}/${nodeName}/data`;
    this.relayDataPath = `${client.tmpDir}/${nodeName}/relay-data`;
  }

  public async generateSpec() {
    const volumes = await this.generateVolumes();
    const volumeMounts = this.generateVolumesMounts();
    const containersPorts = await this.generateContainersPorts();
    const containers = await this.generateContainers(
      volumeMounts,
      containersPorts,
    );
    const podManifest = this.generatePodSpec(containers, volumes);

    return podManifest;
  }

  private async createVolumeDirectories() {
    await makeDir(this.configPath, true);
    await makeDir(this.dataPath, true);
    await makeDir(this.relayDataPath, true);
  }

  private async generateVolumes() {
    await this.createVolumeDirectories();

    const configVolume = {
      name: "tmp-cfg",
      hostPath: { type: "Directory", path: this.configPath },
    };
    const dataVolume = {
      name: "tmp-data",
      hostPath: { type: "Directory", path: this.dataPath },
    };
    const relayDataVolume = {
      name: "tmp-relay-data",
      hostPath: { type: "Directory", path: this.relayDataPath },
    };

    return [configVolume, dataVolume, relayDataVolume];
  }

  private generateVolumesMounts() {
    const configVolumeMount = {
      name: "tmp-cfg",
      mountPath: "/cfg:U",
      readOnly: false,
    };
    const dataVolumeMount = {
      name: "tmp-data",
      mountPath: "/data:U",
      readOnly: false,
    };
    const relayDataVolumeMount = {
      name: "tmp-relay-data",
      mountPath: "/relay-data:U",
      readOnly: false,
    };

    return [configVolumeMount, dataVolumeMount, relayDataVolumeMount];
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

  private async generateContainersPorts() {
    const prometheusPort = {
      containerPort: PROMETHEUS_PORT,
      name: "prometheus",
      hostPort: await this.portFromNodeSetupConfigOrDefault("prometheusPort"),
    };
    const rpcHttpPort = {
      containerPort: RPC_HTTP_PORT,
      name: "rpc",
      hostPort: await this.portFromNodeSetupConfigOrDefault("rpcPort"),
    };
    const rpcWsPort = {
      containerPort: RPC_WS_PORT,
      name: "rpc-ws",
      hostPort: await this.portFromNodeSetupConfigOrDefault("wsPort"),
    };
    const p2pPort = {
      containerPort: P2P_PORT,
      name: "p2p",
      hostPort: await this.portFromNodeSetupConfigOrDefault("p2pPort"),
    };

    return [prometheusPort, rpcHttpPort, rpcWsPort, p2pPort];
  }

  private generateContainerCommand() {
    if (this.nodeSetupConfig.zombieRole === "cumulus-collator") {
      return genCumulusCollatorCmd(this.nodeSetupConfig);
    }

    return genCmd(this.nodeSetupConfig);
  }

  private async generateContainers(volumeMounts: any, ports: any) {
    const bootNodeContainerSpec = {
      image: this.nodeSetupConfig.image,
      name: this.nodeSetupConfig.name,
      imagePullPolicy: "Always",
      env: this.nodeSetupConfig.env,
      volumeMounts,
      ports,
      command: await this.generateContainerCommand(),
    };

    return [bootNodeContainerSpec];
  }

  protected generatePodSpec(containers: any[], volumes: any[]): any {
    const { name, validator } = this.nodeSetupConfig;

    const bootNodePodSpec = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: `${name}_pod`,
        namespace: this.namespace,
        labels: {
          "zombie-role": validator ? "authority" : "full-node",
          app: "zombienet",
          "zombie-ns": this.namespace,
          "app.kubernetes.io/name": this.namespace,
          "app.kubernetes.io/instance": name,
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

    return bootNodePodSpec;
  }
}
