import execa from "execa";
import { resolve } from "path";
import { FINISH_MAGIC_FILE, TRANSFER_CONTAINER_NAME } from "../../configManager";
import { addMinutes, writeLocalJsonFile } from "../../utils";
const fs = require("fs").promises;
import { spawn } from "child_process";
import { availableNetworks } from "@polkadot/util-crypto";
import { fileMap } from "../../types";

const debug = require("debug")("zombie::kube::client");

export interface KubectlResponse {
  exitCode: number;
  stdout: string;
}

export interface ReplaceMapping {
  [propertyName: string]: string;
}

let client: KubeClient;
export function getClient(): KubeClient {
  if (!client) throw new Error("Client not initialized");
  return client;
}

export function initClient(
  configPath: string,
  namespace: string,
  tmpDir: string
): KubeClient {
  client = new KubeClient(configPath, namespace, tmpDir);
  return client;
}

export class KubeClient {
  namespace: string;
  configPath: string;
  debug: boolean;
  timeout: number;
  command: string = "kubectl";
  tmpDir: string;
  podMonitorAvailable: boolean = false;
  localMagicFilepath: string;

  constructor(configPath: string, namespace: string, tmpDir: string) {
    this.configPath = configPath;
    this.namespace = namespace;
    this.debug = true;
    this.timeout = 30; // secs
    this.tmpDir = tmpDir;
    this.localMagicFilepath = `${tmpDir}/finished.txt`;
  }

  async validateAccess(): Promise<boolean> {
    try {
      const result = await this.kubectl(["cluster-info"], undefined, false);
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

  async spawnFromDef(podDef: any, filesToCopy: fileMap[] = [] , filesToGet: fileMap[] = []): Promise<void> {
    const name = podDef.metadata.name;
    writeLocalJsonFile(this.tmpDir, name , podDef);
    debug(
      `launching ${podDef.metadata.name} pod with image ${podDef.spec.containers[0].image}`
    );
    debug(`command: ${podDef.spec.containers[0].command.join(" ")}`);
    await this.createResource(podDef, true, false);
    await this.wait_transfer_container(name);

    for(const fileMap of filesToCopy) {
        const  {localFilePath, remoteFilePath} = fileMap;
        await client.copyFileToPod(name, localFilePath, remoteFilePath, TRANSFER_CONTAINER_NAME)
    }

    await this.putLocalMagicFile(name);
    await this.wait_pod_ready(name);
    debug(`${name} pod is ready!`);
  }

  async putLocalMagicFile(name: string, container?: string) {
    const target = container? container : TRANSFER_CONTAINER_NAME;
    await client.copyFileToPod(
      name,
      this.localMagicFilepath,
      FINISH_MAGIC_FILE,
      target
    );
  }

  // accept a json def
  async createResource(
    resourseDef: any,
    scoped: boolean = false,
    waitReady: boolean = false
  ): Promise<void> {
    await this.kubectl(
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
        const result = await this.kubectl(args, undefined, true);
        //debug( result.stdout );
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
      const result = await this.kubectl(args, undefined, true);
      //debug( result.stdout );
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
      const result = await this.kubectl(args, undefined, true);
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

  async createStaticResource(filename: string, scopeNamespace?: string): Promise<void> {
    const filePath = resolve(__dirname, `../../../static-configs/${filename}`);
    const fileContent = await fs.readFile(filePath);
    const resourceDef = fileContent
      .toString("utf-8")
      .replace(new RegExp("{{namespace}}", "g"), this.namespace);

    if(scopeNamespace) {
      await this.kubectl(["-n", scopeNamespace, "apply", "-f", "-"], resourceDef);
    } else {
      await this.kubectl(["apply", "-f", "-"], resourceDef);
    }
  }

  async createPodMonitor(filename: string, chain: string): Promise<void> {
    this.podMonitorAvailable = await this._isPodMonitorAvailable();
    if( ! this.podMonitorAvailable ) {
      debug("PodMonitor is NOT available in the cluster");
      return;
    }
    const filePath = resolve(__dirname, `../../../static-configs/${filename}`);
    const fileContent = await fs.readFile(filePath);
    const resourceDef = fileContent
      .toString("utf-8")
      .replace(/{{namespace}}/ig, this.namespace)
      .replace(/{{chain}}/ig, chain);
      await this.kubectl(["-n", "monitoring", "apply", "-f", "-"], resourceDef, false);
  }

  async updateResource(
    filename: string,
    replacements: ReplaceMapping = {}
  ): Promise<void> {
    const filePath = resolve(__dirname, `../../../static-configs/${filename}`);
    // const filePath = `static-configs/${filename}`;
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

    await this.kubectl(["apply", "-f", "-"], resourceDef);
  }

  async copyFileToPod(
    identifier: string,
    localFilePath: string,
    podFilePath: string,
    container: string | undefined = undefined
  ) {
    const args = ["cp", localFilePath, `${identifier}:${podFilePath}`];
    if (container) args.push("-c", container);
    const result = await this.kubectl(args, undefined, true);
    debug("copyFileToPod", args);
  }

  async copyFileFromPod(
    identifier: string,
    podFilePath: string,
    localFilePath: string,
    container: string | undefined = undefined
  ) {
    const args = ["cp", `${identifier}:${podFilePath}`, localFilePath];
    if (container) args.push("-c", container);
    const result = await this.kubectl(args, undefined, true);
    debug(result);
  }

  async runningOnMinikube(): Promise<boolean> {
    const result = await this.kubectl([
      "get",
      "sc",
      "-o",
      "go-template='{{range .items}}{{.provisioner}}{{\" \"}}{{end}}'",
    ]);
    return result.stdout.includes("k8s.io/minikube-hostpath");
  }

  async destroyNamespace() {
    await this.kubectl(
      ["delete", "namespace", this.namespace],
      undefined,
      false
    );
  }

  async getBootnodeIP(): Promise<string> {
    const args = ["get", "pod", "bootnode", "-o", "jsonpath={.status.podIP}"];
    const result = await this.kubectl(args, undefined, true);
    return result.stdout;
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
      { type: "role", files: ["prometheus-role.yaml"] },
      { type: "binding", files: ["prometheus-role-binding.yaml"] },
      { type: "data-storage-classes", files: storageFiles },
      {
        type: "configs",
        files: ["prometheus-config.yaml", "grafana-config.yaml"],
      },
      {
        type: "services",
        files: [
          "bootnode-service.yaml",
          "telemetry-service.yaml",
          "prometheus-service.yaml",
        ],
      },
      {
        type: "deployment",
        files: [
          "prometheus-deployment.yaml",
          "grafana-deployment.yaml",
          //"telemetry-deployment.yaml",
        ],
      },
    ];

    for (const resourceType of resources) {
      console.log(`adding ${resourceType.type}`);
      for (const file of resourceType.files) {
        await this.createStaticResource(file);
      }
    }
  }

  async setupCleaner() {
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
    await this.createStaticResource("job-svc-account.yaml");
    if( this.podMonitorAvailable) await this.createStaticResource("job-delete-podmonitor-role.yaml", "monitoring");
  }

  async upsertCronJob(minutes = 10) {
    const isActive = await this.isNamespaceActive();
    if (isActive) {
      if(this.podMonitorAvailable) {
        const podMonitorCleanerMinutes = addMinutes(minutes);
        let schedule = `${podMonitorCleanerMinutes} * * * *`;
        await this.updateResource("job-delete-podmonitor.yaml", { schedule });
      }

      minutes += 1;
      const nsCleanerMinutes = addMinutes(minutes);
      const nsSchedule = `${nsCleanerMinutes} * * * *`;
      await this.updateResource("job-delete-namespace.yaml", { schedule: nsSchedule });
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
    const result = await this.kubectl(args, undefined, false);
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

  async dumpLogs(path: string, podName: string) {
    const dstFileName = `${path}/logs/${podName}.log`;
    const args = ["logs", podName, "--namespace", this.namespace];
    const result = await this.kubectl(args, undefined, false);
    await fs.writeFile(dstFileName, result.stdout);
  }

  // run kubectl
  async kubectl(
    args: string[],
    resourceDef?: string,
    scoped: boolean = true
  ): Promise<KubectlResponse> {
    try {
      const augmentedCmd: string[] = ["--kubeconfig", this.configPath];
      if (scoped) augmentedCmd.push("--namespace", this.namespace);

      const finalArgs = [...augmentedCmd, ...args];

      // if (this.debug) console.log(augmentedCmd.join(" "));

      const result = await execa("kubectl", finalArgs, {
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

  async _isPodMonitorAvailable() {
    let available = false;
    try {
      const result = await execa.command("kubectl api-resources -o name");
      if( result.exitCode == 0 ) {
        if(result.stdout.includes("podmonitor")) available = true;
      }
    } catch(err) {
      console.log(err);
    } finally{
      return available;
    }
  }
}
