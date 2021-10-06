import execa from "execa";
import { KubectlResponse } from "./types";

const fs = require("fs").promises;

export class KubeClient {
  namespace: string;
  configPath: string;
  debug: boolean;
  timeout: number;

  constructor(configPath: string, namespace: string) {
    this.configPath = configPath;
    this.namespace = namespace;
    this.debug = true;
    this.timeout = 30; // secs
  }

  async validateAccess(): Promise<boolean> {
    try {
      const result = await this._kubectl(["cluster-info"], undefined, false);
      return result.exitCode === 0;
    } catch (e) {
      return false;
    }
  }

  // accept a json def
  async crateResource(
    resourseDef: any,
    scoped: boolean = false,
    waitReady: boolean = false
  ): Promise<void> {
    const pod = await this._kubectl(
      ["apply", "-f", "-"],
      JSON.stringify(resourseDef),
      scoped
    );

    const name = resourseDef.metadata.name;
    const kind: string = resourseDef.kind.toLowerCase();

    if (waitReady) {
      // loop until ready
      let t = this.timeout;
      const args = ["get", kind, name, "-o", "jsonpath={.status.phase}"];
      do {
        const result = await this._kubectl(args, undefined, true);
        // console.log( result.stdout );
        if (["Running", "Succeeded"].includes(result.stdout)) return;

        await new Promise((resolve) => setTimeout(resolve, 3000));
        t -= 3;
      } while (t > 0);

      throw new Error(`Timeout(${this.timeout}) for ${kind} : ${name}`);
    }
  }

  async crateStaticResource(filename: string): Promise<void> {
    const filePath = `static-configs/${filename}`;
    const fileContent = await fs.readFile(filePath);
    const resourceDef = fileContent
      .toString("utf-8")
      .replace(new RegExp("{{namespace}}", "g"), this.namespace);
    await this._kubectl(["apply", "-f", "-"], resourceDef);
  }

  async copyFileToPod(
    identifier: string,
    localFilePath: string,
    podFilePath: string
  ) {
    const args = ["cp", localFilePath, `${identifier}:${podFilePath}`];
    const result = await this._kubectl(args, undefined, true);
    // console.log(result);
  }

  async copyFileFromPod(
    identifier: string,
    podFilePath: string,
    localFilePath: string
  ) {
    const args = ["cp", `${identifier}:${podFilePath}`, localFilePath];
    const result = await this._kubectl(args, undefined, true);
    // console.log(result);
  }

  async runningOnMinikube(): Promise<boolean> {
    const result = await this._kubectl([
      "get",
      "sc",
      "-o",
      "go-template='{{range .items}}{{.provisioner}}{{\" \"}}{{end}}'",
    ]);
    return result.stdout.includes("k8s.io/minikube-hostpath");
  }

  async destroyNamespace() {
    await this._kubectl(["delete", "namespace", this.namespace], undefined, false);
  }

  // run kubectl
  async _kubectl(
    args: string[],
    resourceDef?: string,
    scoped: boolean = true
  ): Promise<KubectlResponse> {
    try {
      const augmentedCmd: string[] = [...args, "--kubeconfig", this.configPath];
      if (scoped) augmentedCmd.push("--namespace", this.namespace);

      // if (this.debug) console.log(augmentedCmd.join(" "));

      const result = await execa("kubectl", augmentedCmd, {
        input: resourceDef,
      });
      // console.log(result);
      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }
}
