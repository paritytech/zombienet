import execa from "execa";
import { resolve } from "path";
import { FINISH_MAGIC_FILE, TRANSFER_CONTAINER_NAME } from "../../configManager";
import { addMinutes, writeLocalJsonFile, getSha256 } from "../../utils";
const fs = require("fs").promises;
import { spawn } from "child_process";
import { fileMap } from "../../types";
import { Client, RunCommandResponse, setClient } from "../client";

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
        const result = await this.runCommand(["cluster-info"], undefined, false);
        return result.exitCode === 0;
      } catch (e) {
        return false;
      }
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
    runCommand(args: string[], resourceDef?: string, scoped?: boolean): Promise<RunCommandResponse> {
        throw new Error("Method not implemented.");
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
    wait_transfer_container(podName: string): Promise<void> {
        throw new Error("Method not implemented.");
    }
    wait_pod_ready(podName: string): Promise<void> {
        throw new Error("Method not implemented.");
    }
}

