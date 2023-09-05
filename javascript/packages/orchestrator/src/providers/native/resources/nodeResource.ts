import { getRandomPort, makeDir } from "@zombienet/utils";
import { genCmd, genCumulusCollatorCmd } from "../../../cmdGenerator";
import {
  P2P_PORT,
  PROMETHEUS_PORT,
  RPC_HTTP_PORT,
  RPC_WS_PORT,
} from "../../../constants";
import {
  Node,
  ZombieRole,
  ZombieRoleLabel,
  envVars,
} from "../../../sharedTypes";
import { Client } from "../../client";
import { NodeSpec, Port, PortProperty, ProcessEnvironment } from "./types";

export class NodeResource {
  protected readonly configPath: string;
  protected readonly dataPath: string;
  private readonly relayDataPath: string;

  constructor(
    client: Client,
    protected readonly namespace: string,
    protected readonly nodeSetupConfig: Node,
  ) {
    const nodeRootPath = `${client.tmpDir}/${this.nodeSetupConfig.name}`;
    this.configPath = `${nodeRootPath}/cfg`;
    this.dataPath = `${nodeRootPath}/data`;
    this.relayDataPath = `${nodeRootPath}/relay-data`;
  }

  public async generateSpec() {
    await this.createDirectories();
    const ports = await this.generatePorts();
    const command = await this.generateCommand();
    const zombieRoleLabel = this.getZombieRoleLabel();
    const env = this.getEnv();
    const nodeManifest = this.generateNodeSpec(
      ports,
      command,
      zombieRoleLabel,
      env,
    );

    return nodeManifest;
  }

  protected async createDirectories() {
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

  private async portFromNodeSetupConfigOrDefault(portProperty: PortProperty) {
    if (this.nodeSetupConfig[portProperty]) {
      return this.nodeSetupConfig[portProperty];
    }

    return getRandomPort();
  }

  private async generatePorts(): Promise<Port[]> {
    return [
      {
        containerPort: PROMETHEUS_PORT,
        name: "prometheus",
        flag: "--prometheus-port",
        hostPort: await this.portFromNodeSetupConfigOrDefault("prometheusPort"),
      },
      {
        containerPort: RPC_HTTP_PORT,
        name: "rpc",
        flag: "--rpc-port",
        hostPort: await this.portFromNodeSetupConfigOrDefault("rpcPort"),
      },
      {
        containerPort: RPC_WS_PORT,
        name: "rpc-ws",
        flag: "--ws-port",
        hostPort: await this.portFromNodeSetupConfigOrDefault("wsPort"),
      },
      {
        containerPort: P2P_PORT,
        name: "p2p",
        flag: "--port",
        hostPort: await this.portFromNodeSetupConfigOrDefault("p2pPort"),
      },
    ];
  }

  protected generateCommand() {
    if (this.nodeSetupConfig.zombieRole === ZombieRole.CumulusCollator) {
      return genCumulusCollatorCmd(
        this.nodeSetupConfig,
        this.configPath,
        this.dataPath,
        this.relayDataPath,
        false,
      );
    }

    return genCmd(this.nodeSetupConfig, this.configPath, this.dataPath, false);
  }

  protected getZombieRoleLabel(): ZombieRoleLabel {
    const { zombieRole, validator } = this.nodeSetupConfig;

    if (zombieRole) return zombieRole;

    return validator ? "authority" : "full-node";
  }

  protected getEnv() {
    const { env } = this.nodeSetupConfig;

    return env.reduce((memo, item: envVars) => {
      memo[item.name] = item.value;
      return memo;
    }, {} as ProcessEnvironment);
  }

  protected generateNodeSpec(
    ports: Port[],
    command: string[],
    zombieRole: ZombieRoleLabel,
    env: ProcessEnvironment,
  ): NodeSpec {
    return {
      metadata: {
        name: this.nodeSetupConfig.name,
        namespace: this.namespace,
        labels: {
          "zombie-role": zombieRole,
          app: "zombienet",
          "zombie-ns": this.namespace,
          name: this.namespace,
          instance: this.nodeSetupConfig.name,
        },
      },
      spec: {
        cfgPath: this.configPath,
        dataPath: this.dataPath,
        ports,
        command,
        env,
      },
    };
  }
}
