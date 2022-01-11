import execa from "execa";
import { resolve } from "path";
import { P2P_PORT } from "../../configManager";
import { writeLocalJsonFile, getHostIp } from "../../utils";
const fs = require("fs").promises;
import { fileMap } from "../../types";
import { Client, RunCommandResponse, setClient } from "../client";
import { decorators } from "../../colors";
import YAML from "yaml";

const debug = require("debug")("zombie::kube::client");

export function initClient(
  configPath: string,
  namespace: string,
  tmpDir: string
): PodmanClient {
  const client = new PodmanClient(configPath, namespace, tmpDir);
  setClient(client);
  return client;
}

export class PodmanClient extends Client {
  namespace: string;
  configPath: string;
  debug: boolean;
  timeout: number;
  tmpDir: string;
  podMonitorAvailable: boolean = false;
  localMagicFilepath: string;

  constructor(configPath: string, namespace: string, tmpDir: string) {
    super(configPath, namespace, tmpDir, "podman", "podman");
    this.configPath = configPath;
    this.namespace = namespace;
    this.debug = true;
    this.timeout = 30; // secs
    this.tmpDir = tmpDir;
    this.localMagicFilepath = `${tmpDir}/finished.txt`;
  }

  async validateAccess(): Promise<boolean> {
    try {
      const result = await this.runCommand(["--help"], undefined, false);
      return result.exitCode === 0;
    } catch (e) {
      return false;
    }
  }

  async createNamespace(): Promise<void> {
    const namespaceDef = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        name: this.namespace,
      },
    };

    writeLocalJsonFile(this.tmpDir, "namespace", namespaceDef);
    // Podman don't have the namespace concept yet but we use a isolated network
    let args = ["network", "create", this.namespace];
    await this.runCommand(args, undefined, false);
    return;
  }
  // Podman ONLY support `pods`
  async staticSetup(): Promise<void> {
    const resources: any = [
      //   {
      //     type: "services",
      //     files: [
      //       "bootnode-service.yaml",
      //       "backchannel-service.yaml",
      //       "fileserver-service.yaml"
      //     ],
      //   },
      // {
      //   type: "deployment",
      //   files: [
      //     //"backchannel-pod.yaml",
      //     "fileserver-pod.yaml"
      //   ]
      // }
    ];

    for (const resourceType of resources) {
      console.log(`adding ${resourceType.type}`);
      for (const file of resourceType.files) {
        await this.createStaticResource(file);
      }
    }
  }

  async createStaticResource(filename: string): Promise<void> {
    const filePath = resolve(__dirname, `../../../static-configs/${filename}`);
    const fileContent = await fs.readFile(filePath);
    const resourceDef = fileContent
      .toString("utf-8")
      .replace(new RegExp("{{namespace}}", "g"), this.namespace);

    const doc = new YAML.Document(JSON.parse(resourceDef));

    const docInYaml = doc.toString();

    const localFilePath = `${this.tmpDir}/${filename}`;
    await fs.writeFile(localFilePath, docInYaml);

    await this.runCommand([
      "play",
      "kube",
      "--network",
      this.namespace,
      localFilePath,
    ]);
  }

  async createPodMonitor(filename: string, chain: string): Promise<void> {
    // NOOP, podman don't have podmonitor.
    return;
  }

  async setupCleaner(): Promise<void> {
    // NOOP, podman don't have cronJobs
    return;
  }

  async destroyNamespace(): Promise<void> {
    // get pod names
    let args = [
      "pod",
      "ps",
      "-f",
      `label=zombie-ns=${this.namespace}`,
      "--format",
      "{{.Name}}",
    ];
    let result = await this.runCommand(args, undefined, false);

    // now remove the pods
    args = ["pod", "rm", "-f", ...result.stdout.split("\n")];
    result = await this.runCommand(args, undefined, false);

    // now remove the pnetwork
    args = ["network", "rm", this.namespace];
    result = await this.runCommand(args, undefined, false);
  }

  async dumpLogs(path: string, podName: string): Promise<void> {
    const dstFileName = `${path}/logs/${podName}.log`;
    const args = ["logs", `${podName}_pod-${podName}`];
    const result = await this.runCommand(args, undefined, false);
    await fs.writeFile(dstFileName, result.stdout);
  }

  upsertCronJob(minutes: number): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async startPortForwarding(port: number, identifier: string): Promise<number> {
    const podName = identifier.split("/")[1];
    const hostPort = await this.getPortMapping(port, podName);
    return hostPort;
  }

  async getPortMapping(port: number, podName: string): Promise<number> {
    const args = ["inspect", `${podName}_pod-${podName}`, "--format", "json"];
    const result = await this.runCommand(args, undefined, false);
    const resultJson = JSON.parse(result.stdout);
    const hostPort =
      resultJson[0].NetworkSettings.Ports[`${port}/tcp`][0].HostPort;
    return hostPort;
  }

  async getBootnodeInfo(podName: string): Promise<[string, number]> {
    const hostPort = await this.getPortMapping(P2P_PORT, podName);
    const hostIp = await getHostIp();
    return [hostIp, hostPort];
  }

  async runCommand(
    args: string[],
    resourceDef?: string,
    scoped?: boolean
  ): Promise<RunCommandResponse> {
    try {
      const augmentedCmd: string[] = [];
      if (scoped) augmentedCmd.push("--network", this.namespace);

      // "--storage-driver=vfs",
      const finalArgs = [...augmentedCmd, ...args];
      const result = await execa(this.command, finalArgs);

      // podman use stderr for logs
      const stdout =
        result.stdout !== ""
          ? result.stdout
          : result.stderr !== ""
          ? result.stderr
          : "";

      return {
        exitCode: result.exitCode,
        stdout,
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }
  async spawnFromDef(
    podDef: any,
    filesToCopy: fileMap[] = [],
    filesToGet: fileMap[] = []
  ): Promise<void> {
    const name = podDef.metadata.name;

    console.log(
      `\n\tlaunching ${decorators.green(
        podDef.metadata.name
      )} pod with image ${decorators.green(podDef.spec.containers[0].image)}`
    );
    console.log(
      `\t\t with command: ${decorators.magenta(
        podDef.spec.containers[0].command.join(" ")
      )}`
    );

    // copy files to volume cfg
    for (const fileMap of filesToCopy) {
      const { localFilePath, remoteFilePath } = fileMap;
      await fs.copyFile(
        localFilePath,
        `${this.tmpDir}/${name}${remoteFilePath}`
      );
    }

    await this.createResource(podDef, false, false);

    // TODO: how to check in podman
    await this.wait_pod_ready(name);
    console.log(`\t\t${decorators.green(name)} pod is ready!`);
  }
  async copyFileFromPod(
    identifier: string,
    podFilePath: string,
    localFilePath: string,
    container?: string
  ): Promise<void> {
    // throw new Error("Method not implemented.");
    debug(`cp ${this.tmpDir}/${identifier}${podFilePath}  ${localFilePath}`);
    await fs.copyFile(
      `${this.tmpDir}/${identifier}${podFilePath}`,
      localFilePath
    );
  }

  async putLocalMagicFile(name: string, container?: string): Promise<void> {
    // throw new Error("Method not implemented.");
    // NOOP
    return;
  }

  async createResource(
    resourseDef: any,
    scoped: boolean,
    waitReady: boolean
  ): Promise<void> {
    const name = resourseDef.metadata.name;
    const doc = new YAML.Document(resourseDef);
    const docInYaml = doc.toString();
    const localFilePath = `${this.tmpDir}/${name}.yaml`;
    await fs.writeFile(localFilePath, docInYaml);

    await this.runCommand(
      ["play", "kube", "--network", this.namespace, localFilePath],
      undefined,
      false
    );

    if (waitReady) await this.wait_pod_ready(name);
  }

  async wait_pod_ready(
    podName: string,
    allowDegraded: boolean = true
  ): Promise<void> {
    // loop until ready
    let t = this.timeout;
    const args = ["pod", "ps", "-f", `name=${podName}`, "--format", "json"];
    do {
      const result = await this.runCommand(args, undefined, false);
      const resultJson = JSON.parse(result.stdout);
      if (resultJson[0].Status === "Running") return;
      if (allowDegraded && resultJson[0].Status === "Degraded") return;

      await new Promise((resolve) => setTimeout(resolve, 3000));
      t -= 3;
    } while (t > 0);

    throw new Error(`Timeout(${this.timeout}) for pod : ${podName}`);
  }

  async isPodMonitorAvailable(): Promise<boolean> {
    // NOOP
    return false;
  }
}
