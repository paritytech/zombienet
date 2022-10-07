import execa from "execa";
import { copy as fseCopy } from "fs-extra";
import path, { resolve } from "path";
import YAML from "yaml";
import {
  DEFAULT_DATA_DIR,
  DEFAULT_REMOTE_DIR,
  P2P_PORT,
  PROMETHEUS_PORT,
} from "../../constants";
import { fileMap } from "../../types";
import { decorators } from "../../utils/colors";
import { writeLocalJsonFile } from "../../utils/fs";
import { getHostIp } from "../../utils/net";
import { CreateLogTable } from "../../utils/tableCli";
import { Client, RunCommandResponse, setClient } from "../client";
import {
  genGrafanaDef,
  genPrometheusDef,
  genTempoDef,
  getIntrospectorDef,
} from "./dynResourceDefinition";
const fs = require("fs").promises;

const debug = require("debug")("zombie::podman::client");

export function initClient(
  configPath: string,
  namespace: string,
  tmpDir: string,
): PodmanClient {
  const client = new PodmanClient(configPath, namespace, tmpDir);
  setClient(client);
  return client;
}

export class PodmanClient extends Client {
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

  constructor(configPath: string, namespace: string, tmpDir: string) {
    super(configPath, namespace, tmpDir, "podman", "podman");
    this.configPath = configPath;
    this.namespace = namespace;
    this.debug = true;
    this.timeout = 30; // secs
    this.tmpDir = tmpDir;
    this.localMagicFilepath = `${tmpDir}/finished.txt`;
    this.remoteDir = DEFAULT_REMOTE_DIR;
    this.dataDir = DEFAULT_DATA_DIR;
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

  // start a grafana and prometheus
  async staticSetup(settings: any): Promise<void> {
    const prometheusSpec = await genPrometheusDef(this.namespace);
    const promPort = prometheusSpec.spec.containers[0].ports[0].hostPort;
    await this.createResource(prometheusSpec, false, true);
    console.log(
      `\n\t Monitor: ${decorators.green(
        prometheusSpec.metadata.name,
      )} - url: http://127.0.0.1:${promPort}`,
    );

    const tempoSpec = await genTempoDef(this.namespace);
    await this.createResource(tempoSpec, false, false);
    const jaegerPort = tempoSpec.spec.containers[0].ports[0].hostPort;
    const tempoPort = tempoSpec.spec.containers[0].ports[1].hostPort;
    console.log(
      `\n\t Monitor: ${decorators.green(
        tempoSpec.metadata.name,
      )} - url: http://127.0.0.1:${tempoPort}`,
    );

    const prometheusIp = await this.getNodeIP("prometheus");
    const tempoIp = await this.getNodeIP("tempo");
    const grafanaSpec = await genGrafanaDef(
      this.namespace,
      prometheusIp.toString(),
      tempoIp.toString(),
    );
    await this.createResource(grafanaSpec, false, false);
    const grafanaPort = grafanaSpec.spec.containers[0].ports[0].hostPort;
    console.log(
      `\n\t Monitor: ${decorators.green(
        grafanaSpec.metadata.name,
      )} - url: http://127.0.0.1:${grafanaPort}`,
    );
  }

  async createStaticResource(
    filename: string,
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

  async addNodeToPrometheus(podName: string) {
    const podIp = await this.getNodeIP(podName);
    const content = `[{"labels": {"pod": "${podName}"}, "targets": ["${podIp}:${PROMETHEUS_PORT}"]}]`;
    await fs.writeFile(
      `${this.tmpDir}/prometheus/data/sd_config_${podName}.json`,
      content,
    );
  }

  async getNodeLogs(
    podName: string,
    since: number | undefined = undefined,
  ): Promise<string> {
    const args = ["logs"];
    if (since && since > 0) args.push(...["--since", `${since}s`]);
    args.push(`${podName}_pod-${podName}`);

    const result = await this.runCommand(args, undefined, false);
    return result.stdout;
  }

  async dumpLogs(path: string, podName: string): Promise<void> {
    const dstFileName = `${path}/logs/${podName}.log`;
    const logs = await this.getNodeLogs(podName);
    await fs.writeFile(dstFileName, logs);
  }

  upsertCronJob(minutes: number): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async startPortForwarding(port: number, identifier: string): Promise<number> {
    const podName = identifier.includes("/")
      ? identifier.split("/")[1]
      : identifier;
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

  async getNodeIP(podName: string): Promise<string> {
    const args = ["inspect", `${podName}_pod-${podName}`, "--format", "json"];
    const result = await this.runCommand(args, undefined, false);
    const resultJson = JSON.parse(result.stdout);
    const podIp =
      resultJson[0].NetworkSettings.Networks[this.namespace].IPAddress;
    return podIp;
  }

  async getNodeInfo(
    podName: string,
    port?: number,
    externalView: boolean = false,
  ): Promise<[string, number]> {
    let hostIp, hostPort;
    if (externalView) {
      hostPort = await (port
        ? this.getPortMapping(port, podName)
        : this.getPortMapping(P2P_PORT, podName));
      hostIp = await getHostIp();
    } else {
      hostIp = await this.getNodeIP(podName);
      hostPort = port ? port : P2P_PORT;
    }

    return [hostIp, hostPort];
  }

  async runCommand(
    args: string[],
    resourceDef?: string,
    scoped?: boolean,
  ): Promise<RunCommandResponse> {
    try {
      const augmentedCmd: string[] = [];
      if (scoped) augmentedCmd.push("--network", this.namespace);

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

  async runScript(
    podName: string,
    scriptPath: string,
    args: string[] = [],
  ): Promise<RunCommandResponse> {
    try {
      const scriptFileName = path.basename(scriptPath);
      const scriptPathInPod = `/tmp/${scriptFileName}`;
      const identifier = `${podName}_pod-${podName}`;

      // upload the script
      await this.runCommand([
        "cp",
        scriptPath,
        `${identifier}:${scriptPathInPod}`,
      ]);

      // set as executable
      const baseArgs = ["exec", identifier];
      await this.runCommand(
        [...baseArgs, "/bin/chmod", "+x", scriptPathInPod],
        undefined,
        true,
      );

      // exec
      const result = await this.runCommand(
        [...baseArgs, "bash", "-c", scriptPathInPod, ...args],
        undefined,
        true,
      );

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
  ): Promise<void> {
    const name = podDef.metadata.name;

    const logTable = new CreateLogTable({
      colWidths: [20, 100],
    });

    logTable.pushTo([
      [
        `${decorators.cyan("Launching")}`,
        `${decorators.green(podDef.metadata.name)}`,
      ],
      [
        `${decorators.cyan("Command")}`,
        `${decorators.magenta(podDef.spec.containers[0].command.join(" "))}`,
      ],
    ]);

    if (keystore) {
      // initialize keystore
      const dataPath = podDef.spec.volumes.find(
        (vol: any) => vol.name === "tmp-data",
      );
      debug("dataPath", dataPath);
      const keystoreRemoteDir = `${dataPath.hostPath.path}/chains/${chainSpecId}/keystore`;
      debug("keystoreRemoteDir", keystoreRemoteDir);
      await fs.mkdir(keystoreRemoteDir, { recursive: true });
      // inject keys
      await fseCopy(keystore, keystoreRemoteDir);
      debug("keys injected");
    }

    // copy files to volumes
    for (const fileMap of filesToCopy) {
      const { localFilePath, remoteFilePath } = fileMap;
      await fs.copyFile(
        localFilePath,
        `${this.tmpDir}/${name}${remoteFilePath}`,
      );
    }

    await this.createResource(podDef, false, false);

    await this.wait_pod_ready(name);
    await this.addNodeToPrometheus(name);
    logTable.pushTo([
      [`${decorators.cyan("Status")}`, decorators.green("Ready")],
    ]);
    logTable.print();
  }
  async copyFileFromPod(
    identifier: string,
    podFilePath: string,
    localFilePath: string,
    container?: string,
  ): Promise<void> {
    debug(`cp ${this.tmpDir}/${identifier}${podFilePath}  ${localFilePath}`);
    await fs.copyFile(
      `${this.tmpDir}/${identifier}${podFilePath}`,
      localFilePath,
    );
  }

  async putLocalMagicFile(name: string, container?: string): Promise<void> {
    // NOOP
    return;
  }

  async createResource(
    resourseDef: any,
    scoped: boolean,
    waitReady: boolean,
  ): Promise<void> {
    const name = resourseDef.metadata.name;
    const doc = new YAML.Document(resourseDef);
    const docInYaml = doc.toString();
    const localFilePath = `${this.tmpDir}/${name}.yaml`;
    await fs.writeFile(localFilePath, docInYaml);

    await this.runCommand(
      ["play", "kube", "--network", this.namespace, localFilePath],
      undefined,
      false,
    );

    if (waitReady) await this.wait_pod_ready(name);
  }

  async wait_pod_ready(
    podName: string,
    allowDegraded: boolean = true,
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

  async spawnIntrospector(wsUri: string) {
    const spec = await getIntrospectorDef(this.namespace, wsUri);
    await this.createResource(spec, false, true);
  }
}
