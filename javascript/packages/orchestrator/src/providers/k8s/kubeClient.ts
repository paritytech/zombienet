import {
  addMinutes,
  CreateLogTable,
  decorators,
  getSha256,
  writeLocalJsonFile,
} from "@zombienet/utils";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import execa from "execa";
import path, { resolve } from "path";
import {
  DEFAULT_DATA_DIR,
  DEFAULT_REMOTE_DIR,
  FINISH_MAGIC_FILE,
  P2P_PORT,
  TRANSFER_CONTAINER_NAME,
} from "../../constants";
import { fileMap } from "../../types";
import {
  Client,
  RunCommandOptions,
  RunCommandResponse,
  setClient,
} from "../client";
const fs = require("fs").promises;

const debug = require("debug")("zombie::kube::client");

export interface ReplaceMapping {
  [propertyName: string]: string;
}

export function initClient(
  configPath: string,
  namespace: string,
  tmpDir: string,
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
    this.timeout = 300; // secs
    this.tmpDir = tmpDir;
    this.localMagicFilepath = `${tmpDir}/finished.txt`;
    this.remoteDir = DEFAULT_REMOTE_DIR;
    this.dataDir = DEFAULT_DATA_DIR;
  }

  async validateAccess(): Promise<boolean> {
    try {
      const result = await this.runCommand(["cluster-info"], { scoped: false });
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

    // ensure namespace isolation IFF we are running in CI
    if (process.env.RUN_IN_CONTAINER === "1")
      await this.createStaticResource("namespace-network-policy.yaml");
  }

  async spawnFromDef(
    podDef: any,
    filesToCopy: fileMap[] = [],
    keystore: string,
    chainSpecId: string,
    dbSnapshot?: string,
  ): Promise<void> {
    const name = podDef.metadata.name;
    writeLocalJsonFile(this.tmpDir, `${name}.json`, podDef);

    let logTable = new CreateLogTable({
      colWidths: [20, 100],
    });

    logTable.pushTo([
      [decorators.cyan("Pod"), decorators.green(name)],
      [decorators.cyan("Status"), decorators.green("Launching")],
      [
        decorators.cyan("Image"),
        decorators.green(podDef.spec.containers[0].image),
      ],
      [
        decorators.cyan("Command"),
        decorators.white(podDef.spec.containers[0].command.join(" ")),
      ],
    ]);

    logTable.print();

    await this.createResource(podDef, true, false);
    await this.wait_transfer_container(name);

    if (dbSnapshot) {
      // we need to get the snapshot from a public access
      // and extract to /data
      await this.runCommand([
        "exec",
        name,
        "-c",
        TRANSFER_CONTAINER_NAME,
        "--",
        "ash",
        "-c",
        [
          "mkdir",
          "-p",
          "/data/chains",
          "&&",
          "wget",
          dbSnapshot,
          "-O",
          "/data/chains/db.tgz",
          "&&",
          "cd",
          "/data/chains",
          "&&",
          "tar",
          "-xzvf",
          "db.tgz",
        ].join(" "),
      ]);
    }

    if (keystore) {
      // initialize keystore
      await this.runCommand([
        "exec",
        name,
        "-c",
        TRANSFER_CONTAINER_NAME,
        "--",
        "mkdir",
        "-p",
        `/data/chains/${chainSpecId}/keystore`,
      ]);

      // inject keys
      await this.copyFileToPod(
        name,
        keystore,
        `/data/chains/${chainSpecId}`,
        TRANSFER_CONTAINER_NAME,
        true,
      );
    }

    for (const fileMap of filesToCopy) {
      const { localFilePath, remoteFilePath, unique } = fileMap;
      await this.copyFileToPod(
        name,
        localFilePath,
        remoteFilePath,
        TRANSFER_CONTAINER_NAME,
        unique,
      );
    }

    await this.putLocalMagicFile(name);
    await this.wait_pod_ready(name);
    logTable = new CreateLogTable({
      colWidths: [20, 100],
    });
    logTable.pushToPrint([
      [decorators.cyan("Pod"), decorators.green(name)],
      [decorators.cyan("Status"), decorators.green("Ready")],
    ]);
  }

  async putLocalMagicFile(name: string, container?: string) {
    const target = container ? container : TRANSFER_CONTAINER_NAME;
    const r = await this.runCommand([
      "exec",
      name,
      "-c",
      target,
      "--",
      "touch",
      FINISH_MAGIC_FILE,
    ]);
    debug(r);
  }

  // accept a json def
  async createResource(
    resourseDef: any,
    scoped: boolean = false,
    waitReady: boolean = false,
  ): Promise<void> {
    await this.runCommand(["apply", "-f", "-"], {
      resourceDef: JSON.stringify(resourseDef),
      scoped,
    });

    debug(resourseDef);
    const name = resourseDef.metadata.name;
    const kind: string = resourseDef.kind.toLowerCase();

    if (waitReady) {
      // loop until ready
      let t = this.timeout;
      const args = ["get", kind, name, "-o", "jsonpath={.status}"];
      do {
        const result = await this.runCommand(args);
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
    const args = ["get", "pod", podName, "--no-headers"];
    do {
      const result = await this.runCommand(args);
      if (result.stdout.match(/Running|Completed/)) return;
      if (result.stdout.match(/ErrImagePull|ImagePullBackOff/))
        throw new Error(`Error pulling image for pod : ${podName}`);

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
      const result = await this.runCommand(args);
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
      `Timeout(${this.timeout}) for transfer container for pod : ${podName}`,
    );
  }

  async createStaticResource(
    filename: string,
    scopeNamespace?: string,
    replacements?: { [properyName: string]: string },
  ): Promise<void> {
    const filePath = resolve(__dirname, `../../../static-configs/${filename}`);
    const fileContent = await fs.readFile(filePath);
    let resourceDef = fileContent
      .toString("utf-8")
      .replace(new RegExp("{{namespace}}", "g"), this.namespace);

    if (replacements) {
      for (const replacementKey of Object.keys(replacements)) {
        resourceDef = resourceDef.replace(
          new RegExp(`{{${replacementKey}}}`, "g"),
          replacements[replacementKey],
        );
      }
    }

    if (scopeNamespace) {
      await this.runCommand(["-n", scopeNamespace, "apply", "-f", "-"], {
        resourceDef,
      });
    } else {
      await this.runCommand(["apply", "-f", "-"], {
        resourceDef,
        scoped: false,
      });
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
    await this.runCommand(["-n", "monitoring", "apply", "-f", "-"], {
      resourceDef,
      scoped: false,
    });
    // await this.kubectl(["apply", "-f", "-"], resourceDef, true);
  }

  async updateResource(
    filename: string,
    replacements: ReplaceMapping = {},
  ): Promise<void> {
    const filePath = resolve(__dirname, `../../../static-configs/${filename}`);
    const fileContent = await fs.readFile(filePath);
    let resourceDef = fileContent
      .toString("utf-8")
      .replace(new RegExp("{{namespace}}", "g"), this.namespace);

    for (const replaceKey of Object.keys(replacements)) {
      resourceDef = resourceDef.replace(
        new RegExp(`{{${replaceKey}}}`, "g"),
        replacements[replaceKey],
      );
    }

    await this.runCommand(["apply", "-f", "-"], { resourceDef, scoped: false });
  }

  async copyFileToPod(
    identifier: string,
    localFilePath: string,
    podFilePath: string,
    container: string | undefined = undefined,
    unique: boolean = false,
  ) {
    if (unique) {
      const args = ["cp", localFilePath, `${identifier}:${podFilePath}`];
      if (container) args.push("-c", container);
      await this.runCommand(args);
      debug("copyFileToPod", args);
    } else {
      const fileBuffer = await fs.readFile(localFilePath);
      const fileHash = getSha256(fileBuffer.toString());
      const parts = localFilePath.split("/");
      const fileName = parts[parts.length - 1];
      if (!fileUploadCache[fileHash]) {
        await this.uploadToFileserver(localFilePath, fileName, fileHash);
      }

      // download the file in the container
      const args = ["exec", identifier];
      if (container) args.push("-c", container);
      let extraArgs = [
        "--",
        "/usr/bin/wget",
        "-O",
        podFilePath,
        `http://fileserver/${fileHash}`,
      ];
      debug("copyFileToPodFromFileServer", [...args, ...extraArgs]);
      let result = await this.runCommand([...args, ...extraArgs]);
      debug(result);

      if (container) args.push("-c", container);
      extraArgs = ["--", "chmod", "+x", podFilePath];
      debug("copyFileToPodFromFileServer", [...args, ...extraArgs]);
      result = await this.runCommand([...args, ...extraArgs]);
      debug(result);
    }
  }

  async copyFileFromPod(
    identifier: string,
    podFilePath: string,
    localFilePath: string,
    container: string | undefined = undefined,
  ) {
    const args = ["cp", `${identifier}:${podFilePath}`, localFilePath];
    if (container) args.push("-c", container);
    debug("copyFileFromPod", args);
    const result = await this.runCommand(args);
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
    await this.runCommand(["delete", "namespace", this.namespace], {
      scoped: false,
    });
  }

  async getNodeIP(identifier: string): Promise<string> {
    const args = ["get", "pod", identifier, "-o", "jsonpath={.status.podIP}"];
    const result = await this.runCommand(args);
    return result.stdout;
  }

  async getNodeInfo(
    identifier: string,
    port?: number,
  ): Promise<[string, number]> {
    const ip = await this.getNodeIP(identifier);
    return [ip, port ? port : P2P_PORT];
  }

  async staticSetup(settings: any) {
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
          settings.backchannel ? "backchannel-service.yaml" : null,
          "fileserver-service.yaml",
        ],
      },
      {
        type: "deployment",
        files: [
          settings.backchannel ? "backchannel-pod.yaml" : null,
          "fileserver-pod.yaml",
        ],
      },
    ];

    for (const resourceType of resources) {
      for (const file of resourceType.files) {
        if (file) await this.createStaticResource(file, this.namespace);
      }
    }

    // ensure baseline resources if we are running in CI
    if (process.env.RUN_IN_CONTAINER === "1")
      await this.createStaticResource("baseline-resources.yaml");
  }

  async spawnBackchannel() {}

  async setupCleaner(): Promise<NodeJS.Timer> {
    this.podMonitorAvailable = await this.isPodMonitorAvailable();

    // create CronJob cleanner for namespace
    await this.cronJobCleanerSetup();
    await this.upsertCronJob();

    let cronInterval = setInterval(
      async () => await this.upsertCronJob(),
      8 * 60 * 1000,
    );
    return cronInterval;
  }

  async cronJobCleanerSetup() {
    if (this.podMonitorAvailable)
      await this.createStaticResource(
        "job-delete-podmonitor-role.yaml",
        "monitoring",
      );
    await this.createStaticResource("job-svc-account.yaml");
  }

  async upsertCronJob(minutes = 10) {
    const isActive = await this.isNamespaceActive();
    if (isActive) {
      const now = new Date();
      if (this.podMonitorAvailable) {
        const [hr, min] = addMinutes(minutes, now);
        let schedule = `${min} ${hr} * * *`;
        await this.updateResource("job-delete-podmonitor.yaml", { schedule });
      }

      minutes += 1;
      const [hr, min] = addMinutes(minutes, now);
      const nsSchedule = `${min} ${hr} * * *`;
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
    const result = await this.runCommand(args, { scoped: false });
    if (result.exitCode !== 0 || result.stdout !== "Active") return false;
    return true;
  }

  async startPortForwarding(
    port: number,
    identifier: string,
    namespace?: string,
  ): Promise<number> {
    let intents = 0;
    const createTunnel = (
      remotePort: number,
      identifier: string,
      namespace?: string,
      localPort?: number,
    ) => {
      const mapping = localPort ? `${localPort}:${port}` : `:${port}`;
      const args = [
        "port-forward",
        identifier,
        mapping,
        "--namespace",
        namespace || this.namespace,
        "--kubeconfig",
        this.configPath,
      ];

      const subprocess = spawn("kubectl", args);
      return subprocess;
    };

    return new Promise((resolve, reject) => {
      let subprocess: null | ChildProcessWithoutNullStreams = createTunnel(
        port,
        identifier,
        namespace,
      );

      let resolved = false;
      let mappedPort: number;
      subprocess.stdout.on("data", function (data) {
        if (resolved) return;
        const stdout = data.toString();
        const m = /.\d{1,3}:(\d+)/.exec(stdout);
        debug("stdout: " + stdout);
        if (m && !resolved) {
          resolved = true;
          mappedPort = parseInt(m[1], 10);
          return resolve(mappedPort);
        }
      });

      subprocess.stderr.on("data", function (data) {
        const s = data.toString();
        if (resolved && s.includes("error")) {
          debug("stderr: " + s);
        }
      });

      subprocess.on("exit", function () {
        console.log("child process exited");
        if (resolved && intents < 5 && process.env.terminating !== "1") {
          intents++;
          subprocess = null;
          console.log(
            `creating new port-fw for ${identifier}, with map ${mappedPort}:${port}`,
          );
          createTunnel(port, identifier, namespace, mappedPort);
        }
      });
    });
  }

  async getNodeLogs(
    podName: string,
    since: number | undefined = undefined,
    withTimestamp = false,
  ): Promise<string> {
    const args = ["logs"];
    if (since && since > 0) args.push(`--since=${since}s`);
    if (withTimestamp) args.push("--timestamps=true");
    args.push(...[podName, "-c", podName, "--namespace", this.namespace]);

    const result = await this.runCommand(args, { scoped: false });
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
    opts?: RunCommandOptions,
  ): Promise<RunCommandResponse> {
    try {
      const augmentedCmd: string[] = ["--kubeconfig", this.configPath];
      if (opts?.scoped === undefined || opts?.scoped)
        augmentedCmd.push("--namespace", this.namespace);

      const finalArgs = [...augmentedCmd, ...args];
      debug("finalArgs", finalArgs);
      const result = await execa("kubectl", finalArgs, {
        input: opts?.resourceDef,
      });

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
      };
    } catch (error) {
      debug(error);
      throw error;
    }
  }

  async runScript(
    identifier: string,
    scriptPath: string,
    args: string[] = [],
  ): Promise<RunCommandResponse> {
    try {
      const scriptFileName = path.basename(scriptPath);
      const scriptPathInPod = `/tmp/${scriptFileName}`;
      // upload the script
      await this.copyFileToPod(
        identifier,
        scriptPath,
        scriptPathInPod,
        undefined,
        true,
      );

      // set as executable
      const baseArgs = ["exec", `Pod/${identifier}`, "--"];
      await this.runCommand([...baseArgs, "chmod", "+x", scriptPathInPod]);

      // exec
      const result = await this.runCommand([
        ...baseArgs,
        "bash",
        scriptPathInPod,
        ...args,
      ]);

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
      };
    } catch (error) {
      debug(error);
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
      console.log(
        `\n ${decorators.red("Error: ")} \t ${decorators.bright(err)}\n`,
      );
    } finally {
      return available;
    }
  }

  async spawnIntrospector(wsUri: string) {
    await this.createStaticResource("introspector-pod.yaml", this.namespace, {
      WS_URI: wsUri,
    });

    await this.createStaticResource(
      "introspector-service.yaml",
      this.namespace,
    );

    await this.wait_pod_ready("introspector");
  }

  async uploadToFileserver(
    localFilePath: string,
    fileName: string,
    fileHash: string,
  ) {
    let logTable = new CreateLogTable({
      colWidths: [20, 100],
    });
    logTable.pushTo([
      [decorators.cyan("Uploading:"), decorators.green(localFilePath)],
      [decorators.cyan("as:"), decorators.green(fileHash)],
    ]);
    logTable.print();
    const args = [
      "cp",
      localFilePath,
      `fileserver:/usr/share/nginx/html/${fileHash}`,
    ];

    debug("copyFileToPod", args);
    const result = await this.runCommand(args);
    debug(result);
    fileUploadCache[fileHash] = fileName;
  }
}
