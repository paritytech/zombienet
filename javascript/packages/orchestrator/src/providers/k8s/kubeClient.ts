import {
  addMinutes,
  CreateLogTable,
  decorators,
  getSha256,
  retry,
  sleep,
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
  TRANSFER_CONTAINER_WAIT_LOG,
} from "../../constants";
import { fileMap } from "../../types";
import { ZombieRole } from "../../sharedTypes";
import {
  Client,
  RunCommandOptions,
  RunCommandResponse,
  setClient,
} from "../client";
import { genServiceDef } from "./dynResourceDefinition";
const fs = require("fs").promises;

const debug = require("debug")("zombie::kube::client");
const debugLogs = require("debug")("zombie::kube::client::logs");

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
  command = "kubectl";
  tmpDir: string;
  podMonitorAvailable = false;
  localMagicFilepath: string;
  remoteDir: string;
  dataDir: string;
  inCI: boolean;

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
    // Use the same env vars from spawn/run
    this.inCI =
      process.env.RUN_IN_CONTAINER === "1" ||
      process.env.ZOMBIENET_IMAGE !== undefined;
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
        labels: {
          jobId: process.env.CI_JOB_ID || "",
          projectName: process.env.CI_PROJECT_NAME || "",
          projectId: process.env.CI_PROJECT_ID || "",
        },
      },
    };

    writeLocalJsonFile(this.tmpDir, "namespace", namespaceDef);
    await this.createResource(namespaceDef);

    // ensure namespace isolation IFF we are running in CI
    if (process.env.RUN_IN_CONTAINER === "1")
      await this.createStaticResource(
        "namespace-network-policy.yaml",
        this.namespace,
      );
  }

  async spawnFromDef(
    podDef: any,
    filesToCopy: fileMap[] = [],
    keystore?: string,
    chainSpecId?: string,
    dbSnapshot?: string,
  ): Promise<void> {
    const name = podDef.metadata.name;
    writeLocalJsonFile(this.tmpDir, `${name}.json`, podDef);

    let logTable = new CreateLogTable({
      colWidths: [25, 100],
    });

    const logs = [
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
    ];

    if (dbSnapshot) {
      logs.push([decorators.cyan("DB Snapshot"), decorators.green(dbSnapshot)]);
    }

    logTable.pushToPrint(logs);

    await this.createResource(podDef, true);
    if (podDef.metadata.labels["zombie-role"] !== ZombieRole.Temp) {
      const serviceDef = genServiceDef(podDef);
      writeLocalJsonFile(this.tmpDir, `${name}-service.json`, serviceDef);
      await this.createResource(serviceDef, true);
    }

    await this.waitTransferContainerReady(name);

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
          "/data/",
          "&&",
          "mkdir",
          "-p",
          "/relay-data/",
          "&&",
          "wget",
          dbSnapshot,
          "-O",
          "/data/db.tgz",
          "&&",
          "cd",
          "/",
          "&&",
          "tar",
          "--skip-old-files",
          "-xzvf",
          "/data/db.tgz",
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
    await this.waitPodReady(name);

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
      "sh",
      "-c",
      `/cfg/coreutils touch ${FINISH_MAGIC_FILE}`,
    ]);
    debug(r);
  }

  // accept a json def
  async createResource(resourseDef: any, scoped = false): Promise<void> {
    await this.runCommand(["apply", "-f", "-"], {
      resourceDef: JSON.stringify(resourseDef),
      scoped,
    });

    debug(resourseDef);
  }

  async waitPodReady(pod: string): Promise<void> {
    const args = ["get", "pod", pod, "--no-headers"];
    await retry(
      3000,
      this.timeout * 1000,
      async () => {
        const result = await this.runCommand(args);
        if (result.stdout.match(/Running|Completed/)) return true;
        if (result.stdout.match(/ErrImagePull|ImagePullBackOff/))
          throw new Error(`Error pulling image for pod : ${pod}`);
      },
      `waitPodReady(): pod: ${pod}`,
    );
  }

  async waitContainerInState(
    pod: string,
    container: string,
    state: string,
  ): Promise<void> {
    const args = ["get", "pod", pod, "-o", "jsonpath={.status}"];
    await retry(
      3000,
      this.timeout * 1000,
      async () => {
        const result = await this.runCommand(args);
        const json = JSON.parse(result.stdout);

        const containerStatuses = json?.containerStatuses ?? [];
        const initContainerStatuses = json?.initContainerStatuses ?? [];
        for (const status of containerStatuses.concat(initContainerStatuses)) {
          if (status.name === container && state in status.state) return true;
        }
      },
      `waitContainerInState(): pod: ${pod}, container: ${container}, state: ${state}`,
    );
  }

  async waitLog(pod: string, container: string, log: string): Promise<void> {
    const args = ["logs", "--tail=1", pod, "-c", `${container}`];
    await retry(
      3000,
      this.timeout * 1000,
      async () => {
        const result = await this.runCommand(args);

        if (result.stdout == log) return true;
      },
      `waitLog(): pod: ${pod}, container: ${container}, log: ${log}`,
    );
  }

  async waitTransferContainerReady(pod: string): Promise<void> {
    await this.waitContainerInState(pod, TRANSFER_CONTAINER_NAME, "running");

    await this.waitLog(
      pod,
      TRANSFER_CONTAINER_NAME,
      TRANSFER_CONTAINER_WAIT_LOG,
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
  }

  async updateResource(
    filename: string,
    scopeNamespace?: string,
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
    const cmd = scopeNamespace
      ? ["-n", scopeNamespace, "apply", "-f", "-"]
      : ["apply", "-f", "-"];
    await this.runCommand(cmd, { resourceDef, scoped: false });
  }

  async copyFileToPod(
    identifier: string,
    localFilePath: string,
    podFilePath: string,
    container: string | undefined = undefined,
    unique = false,
  ) {
    if (unique) {
      if (container === TRANSFER_CONTAINER_NAME) {
        const args = ["cp", localFilePath, `${identifier}:${podFilePath}`];
        if (container) args.push("-c", container);
        await this.runCommand(args);
        debug("copyFileToPod", args);
      } else {
        // we are copying to the main container and could be the case that tar
        // isn't available
        const args = [
          "cat",
          localFilePath,
          "|",
          this.command,
          "exec",
          "-n",
          this.namespace,
          identifier,
        ];
        if (container) args.push("-c", container);
        args.push(
          "-i",
          "--",
          "/cfg/coreutils tee",
          podFilePath,
          ">",
          "/dev/null",
        );
        debug("copyFileToPod", args.join(" "));
        // This require local cat binary
        await this.runCommand(["-c", args.join(" ")], { mainCmd: "bash" });
      }
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
    // /cat demo.txt | kubectl -n zombie-4bb2522de792f15656518846a908b8e7 exec  alice -- bash -c "/cfg/bat > /tmp/a.txt"
    // return ["exec", name, "--", "bash", "-c", "echo pause > /tmp/zombiepipe"];
    const args = ["exec", identifier];
    if (container) args.push("-c", container);
    args.push("--", "bash", "-c", `/cfg/coreutils cat ${podFilePath}`);
    // const args = ["exec", identifier, "--", "bash", "-c", `/cfg/bat ${podFilePath}` ]
    // const args = ["cp", `${identifier}:${podFilePath}`, localFilePath];

    debug("copyFileFromPod", args);
    const result = await this.runCommand(args);
    debug(result.exitCode);
    await fs.writeFile(localFilePath, result.stdout);
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
    if (this.podMonitorAvailable) {
      await this.runCommand(
        ["delete", "podmonitor", this.namespace, "-n", "monitoring"],
        {
          scoped: false,
        },
      );
    }

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
    const storageFiles: string[] = (await this.runningOnMinikube())
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
        files: [settings.backchannel ? "backchannel-pod.yaml" : null],
      },
    ];

    for (const resourceType of resources) {
      for (const file of resourceType.files) {
        if (file) await this.createStaticResource(file, this.namespace);
      }
    }

    const xinfra = process.env.X_INFRA_INSTANCE || "ondemand";
    debug("creating fileserver");
    await this.createStaticResource("fileserver-pod.yaml", this.namespace, {
      xinfra,
    });
    debug("waiting for pod: fileserver, to be ready");
    await this.waitPodReady("fileserver");
    debug("pod: fileserver, ready");
    let fileServerOk = false;
    let attempts = 0;
    // try 5 times at most
    for (attempts; attempts < 5; attempts++) {
      if (await this.checkFileServer()) fileServerOk = true;
      else sleep(1 * 1000);
    }

    if (!fileServerOk)
      throw new Error(
        `Can't connect to fileServer, after ${attempts} attempts`,
      );

    // ensure baseline resources if we are running in CI
    if (process.env.RUN_IN_CONTAINER === "1")
      await this.createStaticResource(
        "baseline-resources.yaml",
        this.namespace,
      );
  }

  async checkFileServer(): Promise<boolean> {
    const args = ["exec", "Pod/fileserver", "--", "curl", `http://localhost/`];
    debug("checking fileserver", args);
    const result = await this.runCommand(args, { allowFail: true });
    debug("result", result);
    return result.stdout.includes("Welcome to nginx");
  }
  async spawnBackchannel() {
    console.log("Not implemented function");
  }

  async setupCleaner(): Promise<NodeJS.Timer> {
    this.podMonitorAvailable = await this.isPodMonitorAvailable();

    // create CronJob cleaner for namespace
    await this.cronJobCleanerSetup();
    await this.upsertCronJob();

    const cronInterval = setInterval(
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
        const schedule = `${min} ${hr} * * *`;
        await this.updateResource(
          "job-delete-podmonitor.yaml",
          this.namespace,
          { schedule },
        );
      }

      minutes += 1;
      const [hr, min] = addMinutes(minutes, now);
      const nsSchedule = `${min} ${hr} * * *`;
      await this.updateResource("job-delete-namespace.yaml", this.namespace, {
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
    localPort?: number,
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

    return new Promise((resolve) => {
      let subprocess: null | ChildProcessWithoutNullStreams = createTunnel(
        port,
        identifier,
        namespace,
        localPort,
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
    if (!this.inCI) {
      // we can just return the logs from kube
      const logs = await this.getNodeLogsFromKube(
        podName,
        since,
        withTimestamp,
      );
      return logs;
    }

    // if we are running in CI, could be the case that k8s had rotate the logs,
    // so the simple `kubectl logs` will retrieve only a part of them.
    // We should read it from host filesystem to ensure we are reading all the logs.

    // First get the logs files to check if we need to read from disk or not
    const logFiles = await this.gzippedLogFiles(podName);
    debugLogs("logFiles", logFiles);
    let logs = "";
    if (logFiles.length === 0) {
      logs = await this.getNodeLogsFromKube(podName, since, withTimestamp);
    } else {
      // need to read the files in order and accumulate in logs
      const promises = logFiles.map((file) =>
        this.readgzippedLogFile(podName, file),
      );
      const results = await Promise.all(promises);
      for (const r of results) {
        logs += r;
      }

      // now read the actual log from kube
      logs += await this.getNodeLogsFromKube(podName);
    }

    return logs;
  }

  async gzippedLogFiles(podName: string): Promise<string[]> {
    const [podId, podStatus, zombieRole] = await this.getPodInfo(podName);
    debugLogs("podId", podId);
    debugLogs("podStatus", podStatus);
    debugLogs("zombieRole", zombieRole);
    // we can only get compressed files from `Running` and not temp pods
    if (podStatus !== "Running" || zombieRole == "temp") return [];

    // log dir in ci /var/log/pods/<nsName>_<podName>_<podId>/<podName>
    const logsDir = `/var/log/pods/${this.namespace}_${podName}_${podId}/${podName}`;
    // ls dir sorting asc one file per line (only compressed files)
    // note: use coreutils here since some images (paras) doesn't have `ls`
    const args = ["exec", podName, "--", "/cfg/coreutils", "ls", "-1", logsDir];
    const result = await this.runCommand(args, {
      scoped: true,
      allowFail: false,
    });

    return result.stdout
      .split("\n")
      .filter((f) => f !== "0.log")
      .map((fileName) => `${logsDir}/${fileName}`);
  }

  async getNodeLogsFromKube(
    podName: string,
    since: number | undefined = undefined,
    withTimestamp = false,
  ) {
    const args = ["logs"];
    if (since && since > 0) args.push(`--since=${since}s`);
    if (withTimestamp) args.push("--timestamps=true");
    args.push(...[podName, "-c", podName, "--namespace", this.namespace]);

    const result = await this.runCommand(args, {
      scoped: false,
      allowFail: true,
    });
    if (result.exitCode == 0) {
      return result.stdout;
    } else {
      const warnMsg = `[WARN] error getting log for pod: ${podName}`;
      debug(warnMsg);
      new CreateLogTable({ colWidths: [120], doubleBorder: true }).pushToPrint([
        [decorators.yellow(warnMsg)],
      ]);
      return result.stderr || "";
    }
  }

  async readgzippedLogFile(podName: string, file: string): Promise<string> {
    const args = ["exec", podName, "--", "zcat", "-f", file];
    debugLogs("readgzippedLogFile args", args);
    const result = await this.runCommand(args, {
      scoped: true,
      allowFail: false,
    });

    return result.stdout;
  }

  async getPodInfo(podName: string): Promise<string[]> {
    //  kubectl get pod <podName>  -n <nsName> -o jsonpath='{.metadata.uid}'
    const args = [
      "get",
      "pod",
      podName,
      "-o",
      'jsonpath={.metadata.uid}{","}{.status.phase}{","}{.metadata.labels.zombie-role}',
    ];
    const result = await this.runCommand(args, {
      scoped: true,
      allowFail: false,
    });

    return result.stdout.split(",");
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

      const cmd = opts?.mainCmd || this.command;

      // only apply augmented args when we are using the default cmd.
      const finalArgs =
        cmd !== this.command ? args : [...augmentedCmd, ...args];
      debug("finalArgs", finalArgs);

      const result = await execa(cmd, finalArgs, {
        input: opts?.resourceDef,
      });

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
      };
    } catch (error: any) {
      debug(error);
      if (!opts?.allowFail) throw error;

      const { exitCode, stdout, message: errorMsg } = error;

      return {
        exitCode,
        stdout,
        errorMsg,
      };
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
    }
    return available;
  }

  getPauseArgs(name: string): string[] {
    return ["exec", name, "--", "bash", "-c", "echo pause > /tmp/zombiepipe"];
  }
  getResumeArgs(name: string): string[] {
    return ["exec", name, "--", "bash", "-c", "echo resume > /tmp/zombiepipe"];
  }

  async restartNode(name: string, timeout: number | null): Promise<boolean> {
    const args = ["exec", name, "--", "bash", "-c"];
    const cmd = timeout
      ? `echo restart ${timeout} > /tmp/zombiepipe`
      : `echo restart > /tmp/zombiepipe`;
    args.push(cmd);

    const result = await this.runCommand(args, { scoped: true });
    return result.exitCode === 0;
  }

  async spawnIntrospector(wsUri: string) {
    await this.createStaticResource("introspector-pod.yaml", this.namespace, {
      WS_URI: wsUri,
    });

    await this.createStaticResource(
      "introspector-service.yaml",
      this.namespace,
    );

    await this.waitPodReady("introspector");
  }

  async uploadToFileserver(
    localFilePath: string,
    fileName: string,
    fileHash: string,
  ) {
    const logTable = new CreateLogTable({
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

  getLogsCommand(name: string): string {
    return `kubectl logs -f ${name} -c ${name} -n ${this.namespace}`;
  }

  async injectChaos(chaosSpecs: any[]) {
    const merged = {
      apiVersion: "v1",
      kind: "List",
      items: chaosSpecs,
    };

    writeLocalJsonFile(this.tmpDir, `merged-chaos.json`, merged);
    await this.createResource(merged, true);
  }
}
