import execa from "execa";
import { resolve } from "path";
import { FINISH_MAGIC_FILE, TRANSFER_CONTAINER_NAME } from "../../configManager";
import { addMinutes, writeLocalJsonFile, getSha256 } from "../../utils";
const fs = require("fs").promises;
import { spawn } from "child_process";
import { fileMap } from "../../types";
import { Client, RunCommandResponse, setClient } from "../client";
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
      super(configPath, namespace, tmpDir, "podman", "Podman");
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
        // Podman don't have the namespace concept yet
        // await this.createResource(namespaceDef);

        return;
    }
    // Podman ONLY support `pods`
    async staticSetup(): Promise<void> {
      const resources = [
      //   {
      //     type: "services",
      //     files: [
      //       "bootnode-service.yaml",
      //       "backchannel-service.yaml",
      //       "fileserver-service.yaml"
      //     ],
      //   },
        {
          type: "deployment",
          files: [
            //"backchannel-pod.yaml",
            "fileserver-pod.yaml"
          ]
        }
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
        console.log("es:")
        console.log(docInYaml);
        console.log(doc.toString());

        const localFilePath = `${this.tmpDir}/${filename}`;
        await fs.writeFile(localFilePath, doc.toString());

        await this.runCommand(["play", "kube", localFilePath]);
    }

    async createPodMonitor(filename: string, chain: string): Promise<void> {
      // NOOP, podman don't have podmonitor.
      return;
    }

    async setupCleaner(): Promise<void> {
      // NOOP, podman don't have cronJobs
      return
    }
    destroyNamespace(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    dumpLogs(path: string, podName: string): Promise<void> {
        throw new Error("Method not implemented.");
    }
    upsertCronJob(minutes: number): Promise<void> {
        throw new Error("Method not implemented.");
    }
    startPortForwarding(port: number, identifier: string): Promise<number> {
        throw new Error("Method not implemented.");
    }

    async runCommand(args: string[], resourceDef?: string, scoped?: boolean): Promise<RunCommandResponse> {
        try {
            const augmentedCmd: string[] = [];
            if (scoped) augmentedCmd.push("--namespace", this.namespace);

            const finalArgs = ["--storage-driver=vfs", ...augmentedCmd, ...args];

            console.log(augmentedCmd.join(" "));

            const result = await execa(this.command, finalArgs);
            console.log(result);
            return {
                exitCode: result.exitCode,
                stdout: result.stdout,
            };
        } catch (error) {
            console.log(error);
            throw error;
        }
    }
    async spawnFromDef(podDef: any, filesToCopy: fileMap[] = [] , filesToGet: fileMap[] = []): Promise<void> {
        throw new Error("Method not implemented.");
    }
    copyFileFromPod(identifier: string, podFilePath: string, localFilePath: string, container?: string): Promise<void> {
        throw new Error("Method not implemented.");
    }
    putLocalMagicFile(name: string, container?: string): Promise<void> {
        throw new Error("Method not implemented.");
    }
    createResource(resourseDef: any, scoped: boolean, waitReady: boolean): Promise<void> {
        throw new Error("Method not implemented.");
    }

    // wait_transfer_container(podName: string): Promise<void> {
    //     throw new Error("Method not implemented.");
    // }
    // wait_pod_ready(podName: string): Promise<void> {
    //     throw new Error("Method not implemented.");
    // }
}

