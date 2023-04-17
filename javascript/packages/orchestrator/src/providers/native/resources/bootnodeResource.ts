import { makeDir } from "@zombienet/utils";
import { genCmd } from "../../../cmdGenerator";
import { ZombieRole, ZombieRoleLabel } from "../../../types";
import { NodeResource } from "./nodeResource";
import { NodeSpec, Port, ProcessEnvironment } from "./types";

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

  protected getZombieRoleLabel(): ZombieRoleLabel {
    return ZombieRole.BootNode;
  }

  protected generateNodeSpec(
    ports: Port[],
    command: string[],
    zombieRole: ZombieRoleLabel,
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
