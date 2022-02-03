import execa from "execa";
import { DEFAULT_DATA_DIR, DEFAULT_REMOTE_DIR, P2P_PORT, PROMETHEUS_PORT, RPC_HTTP_PORT, RPC_WS_PORT } from "../../constants";
import { writeLocalJsonFile } from "../../utils";
const fs = require("fs");
const fsPromise = require("fs").promises;
import { fileMap } from "../../types";
import { Client, RunCommandResponse, setClient } from "../client";
import { decorators } from "../../colors";
import YAML from "yaml";
import { spawn } from "child_process";

const debug = require("debug")("zombie::native::client");

export function initClient(
  configPath: string,
  namespace: string,
  tmpDir: string
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
      pid?: number,
      logs: string,
      portMapping : {
        // Map know ports to random selected ones.
        // 9944 : 56045
        [original: number] : number
      }
    }
  };

  constructor(configPath: string, namespace: string, tmpDir: string) {
    super(configPath, namespace, tmpDir, "/bin/bash", "native");
    this.configPath = configPath;
    this.namespace = namespace;
    this.debug = true;
    this.timeout = 30; // secs
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
    await fsPromise.mkdir(this.remoteDir, { recursive: true });
    return;
  }
  // Podman ONLY support `pods`
  async staticSetup(): Promise<void> {
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
    let args = [
      "bash",
      "-c"
    ];

    const memo: string[] = [];
    const pids: string[] = Object.keys(this.processMap).reduce((memo, key) => {
      if (this.processMap[key] && this.processMap[key].pid) {
        const pid = this.processMap[key].pid;
        if(pid) memo.push(pid.toString());
      }
      return memo;
    }, memo);

    args.push(`kill -9 ${pids.join(" ")}`);

    await this.runCommand(args);
  }

  async getNodeLogs(name: string, since: number|undefined = undefined): Promise<string> {
    // For now in native let's just return all the logs
    const lines = await fsPromise.readFile(`${this.tmpDir}/${name}.log`);
    return lines.toString();
  }

  async dumpLogs(path: string, podName: string): Promise<void> {
    const dstFileName = `${path}/logs/${podName}.log`;
    const logs = await this.getNodeLogs(podName);
    await fsPromise.writeFile(dstFileName, logs);
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
  ): Promise<RunCommandResponse> {
    try {
      if(args[0] === "bash") args.splice(0,1);
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
    debug(JSON.stringify(podDef, null, 4));
    // keep this in the client.
    this.processMap[name] = {
      logs: `${this.tmpDir}/${name}.log`,
      portMapping: podDef.spec.ports.reduce((memo:any, item:any) => {
        memo[item.containerPort] = item.hostPort;
        return memo;
      },{})
    };

    console.log(`\n\tlaunching ${decorators.green(name)}`);
    console.log(
      `\t\t with command: ${decorators.magenta(
        podDef.spec.command.join(" ")
      )}`
    );

    // initialize keystore
    await fsPromise.mkdir(`${podDef.spec.dataPath}/chains/${this.chainId}/keystore`, { recursive: true });

    // copy files to volume cfg
    for (const fileMap of filesToCopy) {
      const { localFilePath, remoteFilePath } = fileMap;
      debug("remoteFilePath", remoteFilePath);
      debug("remote dir", this.remoteDir);
      debug("data dir", this.dataDir);

      const resolvedRemoteFilePath = remoteFilePath.includes(this.remoteDir) ?
        `${podDef.spec.cfgPath}/${remoteFilePath.replace(this.remoteDir, "")}` :
        `${podDef.spec.dataPath}/${remoteFilePath.replace(this.dataDir, "")}`;

      await fsPromise.copyFile(
        localFilePath,
        resolvedRemoteFilePath
      );
    }

    await this.createResource(podDef);
    console.log(`\t\t${decorators.green(name)} is ready!`);
  }

  async copyFileFromPod(
    identifier: string,
    podFilePath: string,
    localFilePath: string,
    container?: string
  ): Promise<void> {
    debug(`cp ${podFilePath}  ${localFilePath}`);
    await fsPromise.copyFile(
      podFilePath,
      localFilePath
    );
  }

  async putLocalMagicFile(name: string, container?: string): Promise<void> {
    // NOOP
    return;
  }

  async createResource(
    resourseDef: any
  ): Promise<void> {
    const name = resourseDef.metadata.name;
    const doc = new YAML.Document(resourseDef);
    const docInYaml = doc.toString();
    const localFilePath = `${this.tmpDir}/${name}.yaml`;
    await fsPromise.writeFile(localFilePath, docInYaml);

    if(resourseDef.metadata.labels["zombie-role"] === "temp" ) {
      await this.runCommand(resourseDef.spec.command);
    } else {
      if(resourseDef.spec.command[0] === "bash") resourseDef.spec.command.splice(0,1);
      debug(this.command);
      debug(resourseDef.spec.command);

      const logFile = `${this.tmpDir}/${name}.log`;
      const log = fs.createWriteStream(logFile);
      const nodeProcess = spawn(this.command, [ "-c", ...resourseDef.spec.command]);
      debug(nodeProcess.pid);
      nodeProcess.stdout.pipe(log);
      nodeProcess.stderr.pipe(log);
      this.processMap[name].pid = nodeProcess.pid;

      await this.wait_node_ready(name, logFile);
    }
  }

  async wait_node_ready(
    nodeName: string,
    logFile: string,
  ): Promise<void> {
    // loop until ready
    let t = this.timeout;
    const args = ["-c", `grep 'Listening for new connections'  ${logFile} | wc -l`];
    do {
      const result = await this.runCommand(args);
      debug(result);
      if(result.stdout.trim() === "1") return;

      await new Promise((resolve) => setTimeout(resolve, 3000));
      t -= 3;
    } while (t > 0);

    throw new Error(`Timeout(${this.timeout}) for node : ${nodeName}`);
  }

  async isPodMonitorAvailable(): Promise<boolean> {
    // NOOP
    return false;
  }
}
