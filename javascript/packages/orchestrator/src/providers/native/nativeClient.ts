import {
  CreateLogTable,
  decorators,
  downloadFile,
  makeDir,
  sleep,
  writeLocalJsonFile,
} from "@zombienet/utils";
import { spawn } from "child_process";
import execa from "execa";
import { copy as fseCopy } from "fs-extra";
import path from "path";
import YAML from "yaml";
import {
  DEFAULT_DATA_DIR,
  DEFAULT_REMOTE_DIR,
  P2P_PORT,
} from "../../constants";
import { fileMap } from "../../types";
import {
  Client,
  RunCommandOptions,
  RunCommandResponse,
  setClient,
} from "../client";
const fs = require("fs");

const debug = require("debug")("zombie::native::client");

export function initClient(
  configPath: string,
  namespace: string,
  tmpDir: string,
): NativeClient {
  const client = new NativeClient(configPath, namespace, tmpDir);
  setClient(client);
  return client;
}

export class NativeClient extends Client {
  namespace: string;
  chainId?: string;
  configPath: string;
  debug: boolean;
  timeout: number;
  tmpDir: string;
  podMonitorAvailable: boolean = false;
  localMagicFilepath: string;
  remoteDir: string;
  dataDir: string;
  processMap: {
    [name: string]: {
      pid?: number;
      logs: string;
      portMapping: {
        // Map know ports to random selected ones.
        // 9944 : 56045
        [original: number]: number;
      };
    };
  };

  constructor(configPath: string, namespace: string, tmpDir: string) {
    super(configPath, namespace, tmpDir, "/bin/bash", "native");
    this.configPath = configPath;
    this.namespace = namespace;
    this.debug = true;
    this.timeout = 60; // secs
    this.tmpDir = tmpDir;
    this.localMagicFilepath = `${tmpDir}/finished.txt`;
    this.processMap = {};
    this.remoteDir = `${tmpDir}${DEFAULT_REMOTE_DIR}`;
    this.dataDir = `${tmpDir}${DEFAULT_DATA_DIR}`;
  }

  async validateAccess(): Promise<boolean> {
    try {
      const result = await this.runCommand(["--help"]);
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
    // Native provider don't have the `namespace` isolation.
    // but we create the `remoteDir` to place files
    await makeDir(this.remoteDir, true);
    return;
  }
  // Podman ONLY support `pods`
  async staticSetup(_: any): Promise<void> {
    return;
  }

  async createStaticResource(filename: string): Promise<void> {
    // NOOP, native don't have podmonitor.
    return;
  }

  async createPodMonitor(filename: string, chain: string): Promise<void> {
    // NOOP, native don't have podmonitor.
    return;
  }

  async setupCleaner(): Promise<void> {
    // NOOP, podman don't have cronJobs
    return;
  }

  async destroyNamespace(): Promise<void> {
    // get pod names
    let args = ["bash", "-c"];

    const memo: string[] = [];
    const pids: string[] = Object.keys(this.processMap).reduce((memo, key) => {
      if (this.processMap[key] && this.processMap[key].pid) {
        const pid = this.processMap[key].pid;
        if (pid) memo.push(pid.toString());
      }
      return memo;
    }, memo);

    args.push(`kill -9 ${pids.join(" ")}`);

    await this.runCommand(args);
  }

  async getNodeLogs(
    name: string,
    since: number | undefined = undefined,
  ): Promise<string> {
    // For now in native let's just return all the logs
    const lines = await fs.promises.readFile(`${this.tmpDir}/${name}.log`);
    return lines.toString();
  }

  async dumpLogs(path: string, podName: string): Promise<void> {
    const dstFileName = `${path}/logs/${podName}.log`;
    await fs.promises.copyFile(`${this.tmpDir}/${podName}.log`, dstFileName);
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
    return this.processMap[podName].portMapping[port];
  }

  async getNodeInfo(podName: string): Promise<[string, number]> {
    const hostPort = await this.getPortMapping(P2P_PORT, podName);
    return ["127.0.0.1", hostPort];
  }

  async runCommand(
    args: string[],
    opts?: RunCommandOptions,
  ): Promise<RunCommandResponse> {
    try {
      if (args[0] === "bash") args.splice(0, 1);
      debug(args);
      const result = await execa(this.command, args);

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
      const scriptPathInPod = `${this.tmpDir}/${identifier}/${scriptFileName}`;
      // upload the script
      await fs.promises.cp(scriptPath, scriptPathInPod);

      // set as executable
      await execa(this.command, [
        "-c",
        ["chmod", "+x", scriptPathInPod].join(" "),
      ]);

      // exec
      const result = await execa(this.command, [
        "-c",
        [
          `cd ${this.tmpDir}/${identifier}`,
          "&&",
          scriptPathInPod,
          ...args,
        ].join(" "),
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

  async spawnFromDef(
    podDef: any,
    filesToCopy: fileMap[] = [],
    keystore: string,
    chainSpecId: string,
    dbSnapshot?: string,
  ): Promise<void> {
    const name = podDef.metadata.name;
    debug(JSON.stringify(podDef, null, 4));
    // keep this in the client.
    this.processMap[name] = {
      logs: `${this.tmpDir}/${name}.log`,
      portMapping: podDef.spec.ports.reduce((memo: any, item: any) => {
        memo[item.containerPort] = item.hostPort;
        return memo;
      }, {}),
    };

    let logTable = new CreateLogTable({
      colWidths: [20, 100],
    });

    logTable.pushToPrint([
      [decorators.cyan("Pod"), decorators.green(name)],
      [decorators.cyan("Status"), decorators.green("Launching")],
      [
        decorators.cyan("Command"),
        decorators.white(podDef.spec.command.join(" ")),
      ],
    ]);

    if (dbSnapshot) {
      // we need to get the snapshot from a public access
      // and extract to /data
      await makeDir(`${podDef.spec.dataPath}/chains`, true);

      await downloadFile(dbSnapshot, `${podDef.spec.dataPath}/chains/db.tgz`);
      await this.runCommand([
        "-c",
        `cd ${podDef.spec.dataPath}/chains && tar -xzvf db.tgz`,
      ]);
    }

    if (keystore) {
      // initialize keystore
      const keystoreRemoteDir = `${podDef.spec.dataPath}/chains/${chainSpecId}/keystore`;
      await makeDir(keystoreRemoteDir, true);
      // inject keys
      await fseCopy(keystore, keystoreRemoteDir);
    }

    // copy files to volumes
    for (const fileMap of filesToCopy) {
      const { localFilePath, remoteFilePath } = fileMap;
      debug("localFilePath", localFilePath);
      debug("remoteFilePath", remoteFilePath);
      debug("remote dir", this.remoteDir);
      debug("data dir", this.dataDir);

      const resolvedRemoteFilePath = remoteFilePath.includes(this.remoteDir)
        ? `${podDef.spec.cfgPath}/${remoteFilePath.replace(this.remoteDir, "")}`
        : `${podDef.spec.dataPath}/${remoteFilePath.replace(this.dataDir, "")}`;

      await fs.promises.copyFile(localFilePath, resolvedRemoteFilePath);
    }

    await this.createResource(podDef);
    logTable = new CreateLogTable({
      colWidths: [40, 80],
    });
    logTable.pushToPrint([
      [decorators.cyan("Pod"), decorators.green(name)],
      [decorators.cyan("Status"), decorators.green("Ready")],
    ]);
  }

  async copyFileFromPod(
    identifier: string,
    podFilePath: string,
    localFilePath: string,
    container?: string,
  ): Promise<void> {
    debug(`cp ${podFilePath}  ${localFilePath}`);
    await fs.promises.copyFile(podFilePath, localFilePath);
  }

  async putLocalMagicFile(name: string, container?: string): Promise<void> {
    // NOOP
    return;
  }

  async createResource(resourseDef: any): Promise<void> {
    const name = resourseDef.metadata.name;
    const doc = new YAML.Document(resourseDef);
    const docInYaml = doc.toString();
    const localFilePath = `${this.tmpDir}/${name}.yaml`;
    await fs.promises.writeFile(localFilePath, docInYaml);

    if (resourseDef.metadata.labels["zombie-role"] === "temp") {
      await this.runCommand(resourseDef.spec.command);
    } else {
      if (resourseDef.spec.command[0] === "bash")
        resourseDef.spec.command.splice(0, 1);
      debug(this.command);
      debug(resourseDef.spec.command);

      const log = fs.createWriteStream(this.processMap[name].logs);
      const nodeProcess = spawn(this.command, [
        "-c",
        ...resourseDef.spec.command,
      ]);
      debug(nodeProcess.pid);
      nodeProcess.stdout.pipe(log);
      nodeProcess.stderr.pipe(log);
      this.processMap[name].pid = nodeProcess.pid;

      await this.wait_node_ready(name);
    }
  }

  async wait_node_ready(nodeName: string): Promise<void> {
    // check if the process is alive after 1 seconds
    await sleep(1000);
    const procNodeName = this.processMap[nodeName];
    const { pid, logs } = procNodeName;
    const result = await this.runCommand(["-c", `ps ${pid}`], {
      allowFail: true,
    });
    if (result.exitCode > 0) {
      const lines = await this.getNodeLogs(nodeName);

      let logTable = new CreateLogTable({
        colWidths: [20, 100],
      });

      logTable.pushToPrint([
        [decorators.cyan("Pod"), decorators.green(nodeName)],
        [decorators.cyan("Status"), decorators.red("Error")],
        [
          decorators.cyan("Message"),
          decorators.white(`Process: ${pid}, for node: ${nodeName} dies.`),
        ],
        [decorators.cyan("Output"), decorators.white(lines)],
      ]);

      // throw
      throw new Error();
    }

    // check log lines grow between 2/6/12 secs
    const lines_1 = await this.runCommand(["-c", `wc -l ${logs}`]);
    await sleep(2000);
    const lines_2 = await this.runCommand(["-c", `wc -l ${logs}`]);
    if (parseInt(lines_2.stdout.trim()) > parseInt(lines_1.stdout.trim()))
      return;
    await sleep(6000);
    const lines_3 = await this.runCommand(["-c", `wc -l ${logs}`]);
    if (parseInt(lines_3.stdout.trim()) > parseInt(lines_1.stdout.trim()))
      return;

    await sleep(12000);
    const lines_4 = await this.runCommand(["-c", `wc -l ${logs}`]);
    if (parseInt(lines_4.stdout.trim()) > parseInt(lines_1.stdout.trim()))
      return;

    throw new Error(
      `Log lines of process: ${pid} ( node: ${nodeName} ) doesn't grow, please check logs at ${logs}`,
    );
  }

  async isPodMonitorAvailable(): Promise<boolean> {
    // NOOP
    return false;
  }
}
