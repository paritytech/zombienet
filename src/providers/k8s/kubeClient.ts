import execa from "execa";
import { resolve } from "path";
import {
  DEFAULT_DATA_DIR,
  DEFAULT_REMOTE_DIR,
  FINISH_MAGIC_FILE,
  P2P_PORT,
  TRANSFER_CONTAINER_NAME,
} from "../../constants";
import { addMinutes, writeLocalJsonFile, getSha256 } from "../../utils";
const fs = require("fs").promises;
import { spawn } from "child_process";
import { fileMap } from "../../types";
import { Client, RunCommandResponse, setClient } from "../client";
import { decorators } from "../../colors";

const debug = require("debug")("zombie::kube::client");

export interface ReplaceMapping {
  [propertyName: string]: string;
}

export function initClient(
  configPath: string,
  namespace: string,
  tmpDir: string
): KubeClient {
  const client = new KubeClient(configPath, namespace, tmpDir);
  setClient(client);
  return client;
}

// Here we cache each file we upload from local
// to just cp between pods and not upload again the same file.
const fileUploadCache: any = {};

export class KubeClient extends Client {
  namespace: string;
  chainId?: string;
  configPath: string;
  debug: boolean;
  timeout: number;
  command: string = "kubectl";
  tmpDir: string;
  podMonitorAvailable: boolean = false;
  localMagicFilepath: string;
  remoteDir: string;
  dataDir: string;

  constructor(configPath: string, namespace: string, tmpDir: string) {
    super(configPath, namespace, tmpDir, "kubectl", "kubernetes");
    this.configPath = configPath;
    this.namespace = namespace;
    this.debug = true;
    this.timeout = 60; // secs
    this.tmpDir = tmpDir;
    this.localMagicFilepath = `${tmpDir}/finished.txt`;
    this.remoteDir = DEFAULT_REMOTE_DIR;
    this.dataDir = DEFAULT_DATA_DIR;
  }

  async validateAccess(): Promise<boolean> {
    try {
      const result = await this.runCommand(["cluster-info"], undefined, false);
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
    await this.createResource(namespaceDef);
  }

  async spawnFromDef(
    podDef: any,
    filesToCopy: fileMap[] = [],
    keystore: string
  ): Promise<void> {
    const name = podDef.metadata.name;
    writeLocalJsonFile(this.tmpDir, `${name}.json`, podDef);
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

    await this.createResource(podDef, true, false);
    await this.wait_transfer_container(name);

    if (keystore) {
      // initialize keystore
      await this.runCommand(
        [
          "exec",
          name,
          "-c",
          TRANSFER_CONTAINER_NAME,
          "--",
          "/bin/mkdir",
          "-p",
          `/data/chains/${this.chainId}/keystore`,
        ],
        undefined,
        true
      );

      // inject keys
      await this.copyFileToPod(
        name,
        keystore,
        `/data/chains/${this.chainId}`,
        TRANSFER_CONTAINER_NAME,
        true
      );
    }

    for (const fileMap of filesToCopy) {
      const { localFilePath, remoteFilePath, unique } = fileMap;
      await this.copyFileToPod(
        name,
        localFilePath,
        remoteFilePath,
        TRANSFER_CONTAINER_NAME,
        unique
      );
    }

    await this.putLocalMagicFile(name);
    await this.wait_pod_ready(name);
    console.log(`\t\t${decorators.green(name)} pod is ready!`);
  }

  async putLocalMagicFile(name: string, container?: string) {
    const target = container ? container : TRANSFER_CONTAINER_NAME;
    const r = await this.runCommand([
      "exec",
      name,
      "-c",
      target,
      "--",
      "/bin/touch",
      FINISH_MAGIC_FILE,
    ]);
    debug(r);
  }

  // accept a json def
  async createResource(
    resourseDef: any,
    scoped: boolean = false,
    waitReady: boolean = false
  ): Promise<void> {
    await this.runCommand(
      ["apply", "-f", "-"],
      JSON.stringify(resourseDef),
      scoped
    );

    debug(resourseDef);
    const name = resourseDef.metadata.name;
    const kind: string = resourseDef.kind.toLowerCase();

    if (waitReady) {
      // loop until ready
      let t = this.timeout;
      const args = ["get", kind, name, "-o", "jsonpath={.status}"];
      do {
        const result = await this.runCommand(args, undefined, true);
        const status = JSON.parse(result.stdout);
        if (["Running", "Succeeded"].includes(status.phase)) return;

        // check if we are waiting init container
        for (const s of status.initContainerStatuses) {
          if (s.name === TRANSFER_CONTAINER_NAME && s.state.running) return;
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));
        t -= 3;
      } while (t > 0);

      throw new Error(`Timeout(${this.timeout}) for ${kind} : ${name}`);
    }
  }

  async wait_pod_ready(podName: string): Promise<void> {
    // loop until ready
    let t = this.timeout;
    const args = ["get", "pod", podName, "-o", "jsonpath={.status.phase}"];
    do {
      const result = await this.runCommand(args, undefined, true);
      if (["Running", "Succeeded"].includes(result.stdout)) return;

      await new Promise((resolve) => setTimeout(resolve, 3000));
      t -= 3;
    } while (t > 0);

    throw new Error(`Timeout(${this.timeout}) for pod : ${podName}`);
  }
  async wait_transfer_container(podName: string): Promise<void> {
    // loop until ready
    let t = this.timeout;
    const args = ["get", "pod", podName, "-o", "jsonpath={.status}"];
    do {
      const result = await this.runCommand(args, undefined, true);
      const status = JSON.parse(result.stdout);

      // check if we are waiting init container
      if (status.initContainerStatuses) {
        for (const s of status.initContainerStatuses) {
          if (s.name === TRANSFER_CONTAINER_NAME && s.state.running) return;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
      t -= 3;
    } while (t > 0);

    throw new Error(
      `Timeout(${this.timeout}) for transfer container for pod : ${podName}`
    );
  }

  async createStaticResource(
    filename: string,
    scopeNamespace?: string
  ): Promise<void> {
    const filePath = resolve(__dirname, `../../../static-configs/${filename}`);
    const fileContent = await fs.readFile(filePath);
    const resourceDef = fileContent
      .toString("utf-8")
      .replace(new RegExp("{{namespace}}", "g"), this.namespace);

    if (scopeNamespace) {
      await this.runCommand(
        ["-n", scopeNamespace, "apply", "-f", "-"],
        resourceDef
      );
    } else {
      await this.runCommand(["apply", "-f", "-"], resourceDef);
    }
  }

  async createPodMonitor(filename: string, chain: string): Promise<void> {
    this.podMonitorAvailable = await this.isPodMonitorAvailable();
    if (!this.podMonitorAvailable) {
      debug("PodMonitor is NOT available in the cluster");
      return;
    }
    const filePath = resolve(__dirname, `../../../static-configs/${filename}`);
    const fileContent = await fs.readFile(filePath);
    const resourceDef = fileContent
      .toString("utf-8")
      .replace(/{{namespace}}/gi, this.namespace)
      .replace(/{{chain}}/gi, chain);
    await this.runCommand(
      ["-n", "monitoring", "apply", "-f", "-"],
      resourceDef,
      false
    );
    // await this.kubectl(["apply", "-f", "-"], resourceDef, true);
  }

  async updateResource(
    filename: string,
    replacements: ReplaceMapping = {}
  ): Promise<void> {
    const filePath = resolve(__dirname, `../../../static-configs/${filename}`);
    const fileContent = await fs.readFile(filePath);
    let resourceDef = fileContent
      .toString("utf-8")
      .replace(new RegExp("{{namespace}}", "g"), this.namespace);

    for (const replaceKey of Object.keys(replacements)) {
      resourceDef = resourceDef.replace(
        new RegExp(`{{${replaceKey}}}`, "g"),
        replacements[replaceKey]
      );
    }

    await this.runCommand(["apply", "-f", "-"], resourceDef);
  }

  async copyFileToPod(
    identifier: string,
    localFilePath: string,
    podFilePath: string,
    container: string | undefined = undefined,
    unique: boolean = false
  ) {
    if (unique) {
      const args = ["cp", localFilePath, `${identifier}:${podFilePath}`];
      if (container) args.push("-c", container);
      const result = await this.runCommand(args, undefined, true);
      debug("copyFileToPod", args);
    } else {
      const hashedName = getSha256(localFilePath);
      const parts = localFilePath.split("/");
      const fileName = parts[parts.length - 1];
      if (!fileUploadCache[hashedName]) {
        console.log(
          "uploading to fileserver: " + localFilePath + " as:" + hashedName
        );
        const args = [
          "cp",
          localFilePath,
          `fileserver:/usr/share/nginx/html/${hashedName}`,
        ];

        debug("copyFileToPod", args);
        const result = await this.runCommand(args, undefined, true);
        debug(result);
        fileUploadCache[hashedName] = fileName;
      }

      // download the file in the container
      const args = ["exec", identifier];
      if (container) args.push("-c", container);
      let extraArgs = [
        "--",
        "/usr/bin/wget",
        "-O",
        podFilePath,
        `http://fileserver/${hashedName}`,
      ];
      debug("copyFileToPodFromFileServer", [...args, ...extraArgs]);
      let result = await this.runCommand(
        [...args, ...extraArgs],
        undefined,
        true
      );
      debug(result);

      if (container) args.push("-c", container);
      extraArgs = ["--", "/bin/chmod", "+x", podFilePath];
      debug("copyFileToPodFromFileServer", [...args, ...extraArgs]);
      result = await this.runCommand([...args, ...extraArgs], undefined, true);
      debug(result);
    }
  }

  async copyFileFromPod(
    identifier: string,
    podFilePath: string,
    localFilePath: string,
    container: string | undefined = undefined
  ) {
    const args = ["cp", `${identifier}:${podFilePath}`, localFilePath];
    if (container) args.push("-c", container);
    debug("copyFileFromPod", args);
    const result = await this.runCommand(args, undefined, true);
    debug(result);
  }

  async runningOnMinikube(): Promise<boolean> {
    const result = await this.runCommand([
      "get",
      "sc",
      "-o",
      "go-template='{{range .items}}{{.provisioner}}{{\" \"}}{{end}}'",
    ]);
    return result.stdout.includes("k8s.io/minikube-hostpath");
  }

  async destroyNamespace() {
    await this.runCommand(
      ["delete", "namespace", this.namespace],
      undefined,
      false
    );
  }

  async getNodeIP(identifier: string): Promise<string> {
    const args = ["get", "pod", identifier, "-o", "jsonpath={.status.podIP}"];
    const result = await this.runCommand(args, undefined, true);
    return result.stdout;
  }

  async getNodeInfo(identifier: string): Promise<[string, number]> {
    const ip = await this.getNodeIP(identifier);
    return [ip, P2P_PORT];
  }

  async staticSetup() {
    let storageFiles: string[] = (await this.runningOnMinikube())
      ? [
          "node-data-tmp-storage-class-minikube.yaml",
          "node-data-persistent-storage-class-minikube.yaml",
        ]
      : [
          "node-data-tmp-storage-class.yaml",
          "node-data-persistent-storage-class.yaml",
        ];

    const resources = [
      { type: "data-storage-classes", files: storageFiles },
      {
        type: "services",
        files: [
          "bootnode-service.yaml",
          "backchannel-service.yaml",
          "fileserver-service.yaml",
        ],
      },
      {
        type: "deployment",
        files: ["backchannel-pod.yaml", "fileserver-pod.yaml"],
      },
    ];

    for (const resourceType of resources) {
      for (const file of resourceType.files) {
        await this.createStaticResource(file);
      }
    }
  }

  async setupCleaner(): Promise<NodeJS.Timer> {
    // create CronJob cleanner for namespace
    await this.cronJobCleanerSetup();
    await this.upsertCronJob();

    let cronInterval = setInterval(
      async () => await this.upsertCronJob(),
      8 * 60 * 1000
    );
    return cronInterval;
  }

  async cronJobCleanerSetup() {
    if (this.podMonitorAvailable)
      await this.createStaticResource(
        "job-delete-podmonitor-role.yaml",
        "monitoring"
      );
    await this.createStaticResource("job-svc-account.yaml");
  }

  async upsertCronJob(minutes = 10) {
    const isActive = await this.isNamespaceActive();
    if (isActive) {
      if (this.podMonitorAvailable) {
        const podMonitorCleanerMinutes = addMinutes(minutes);
        let schedule = `${podMonitorCleanerMinutes} * * * *`;
        await this.updateResource("job-delete-podmonitor.yaml", { schedule });
      }

      minutes += 1;
      const nsCleanerMinutes = addMinutes(minutes);
      const nsSchedule = `${nsCleanerMinutes} * * * *`;
      await this.updateResource("job-delete-namespace.yaml", {
        schedule: nsSchedule,
      });
    }
  }

  async isNamespaceActive(): Promise<boolean> {
    const args = [
      "get",
      "namespace",
      this.namespace,
      "-o",
      "jsonpath={.status.phase}",
    ];
    const result = await this.runCommand(args, undefined, false);
    if (result.exitCode !== 0 || result.stdout !== "Active") return false;
    return true;
  }

  async startPortForwarding(port: number, identifier: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const mapping = `:${port}`;
      const args = [
        "port-forward",
        identifier,
        mapping,
        "--namespace",
        this.namespace,
        "--kubeconfig",
        this.configPath,
      ];

      const subprocess = spawn("kubectl", args);

      let resolved = false;
      subprocess.stdout.on("data", function (data) {
        if (resolved) return;
        const stdout = data.toString();
        const m = /.\d{1,3}:(\d+)/.exec(stdout);
        debug("stdout: " + stdout);
        if (m && !resolved) {
          resolved = true;
          resolve(parseInt(m[1]));
        }

        reject(new Error(`ERR: port-fw for ${identifier}`));
      });

      subprocess.stderr.on("data", function (data) {
        const s = data.toString();
        if (resolved && s.includes("error")) {
          reject(new Error(`ERR: port-fw for ${identifier} : ${s}`));
          debug("stderr: " + s);
        }
      });

      subprocess.on("exit", function () {
        console.log("child process exited");
        reject(new Error(`ERR: port-fw for ${identifier}`));
      });
    });
  }

  async getNodeLogs(
    podName: string,
    since: number | undefined = undefined,
    withTimestamp = false
  ): Promise<string> {
    const args = ["logs"];
    if (since && since > 0) args.push(`--since=${since}s`);
    if (withTimestamp) args.push("--timestamps=true");
    args.push(...[podName, "--namespace", this.namespace]);

    const result = await this.runCommand(args, undefined, false);
    return result.stdout;
  }

  async dumpLogs(path: string, podName: string) {
    const dstFileName = `${path}/logs/${podName}.log`;
    const logs = await this.getNodeLogs(podName);
    await fs.writeFile(dstFileName, logs);
  }

  // run kubectl
  async runCommand(
    args: string[],
    resourceDef?: string,
    scoped: boolean = true
  ): Promise<RunCommandResponse> {
    try {
      const augmentedCmd: string[] = ["--kubeconfig", this.configPath];
      if (scoped) augmentedCmd.push("--namespace", this.namespace);

      const finalArgs = [...augmentedCmd, ...args];
      const result = await execa("kubectl", finalArgs, {
        input: resourceDef,
      });

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async isPodMonitorAvailable() {
    let available = false;
    try {
      const result = await execa.command("kubectl api-resources -o name");
      if (result.exitCode == 0) {
        if (result.stdout.includes("podmonitor")) available = true;
      }
    } catch (err) {
      console.log(err);
    } finally {
      return available;
    }
  }
}
