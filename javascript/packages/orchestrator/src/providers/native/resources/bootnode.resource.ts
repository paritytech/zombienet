import { makeDir } from "@zombienet/utils";
import { genCmd } from "../../../cmdGenerator";
import { NodeResource } from "./node.resource";
import { NodeSpec, Port, ProcessEnvironment, ZombieRole } from "./types";

export class BootNodeResource extends NodeResource {
  protected async createDirectories() {
    try {
      await makeDir(this.configPath, true);
      await makeDir(this.dataPath, true);
    } catch {
      throw new Error(
        `Error generating directories for ${this.nodeSetupConfig.name} resource`,
      );
    }
  }

  protected generateCommand() {
    return genCmd(this.nodeSetupConfig, this.configPath, this.dataPath, false);
  }

  protected getZombieRole(): ZombieRole {
    return "bootnode";
  }

  protected generateNodeSpec(
    ports: Port[],
    command: string[],
    zombieRole: ZombieRole,
    env: ProcessEnvironment,
  ): NodeSpec {
    return {
      metadata: {
        name: "bootnode",
        namespace: this.namespace,
        labels: {
          name: this.namespace,
          instance: "bootnode",
          "zombie-role": zombieRole,
          app: "zombienet",
          "zombie-ns": this.namespace,
        },
      },
      spec: {
        cfgPath: this.configPath,
        ports,
        command,
        env,
      },
    };
  }
}
