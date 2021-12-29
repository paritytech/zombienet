import { fileMap } from "../types";

export interface RunCommandResponse {
    exitCode: number;
    stdout: string;
}

export abstract class Client{
    namespace: string;
    configPath: string;
    debug: boolean;
    timeout: number;
    command: string;
    tmpDir: string;
    podMonitorAvailable: boolean = false;
    localMagicFilepath: string;
    providerName: string;

    constructor(configPath: string, namespace: string, tmpDir: string, command: string, providerName: string) {
      this.configPath = configPath;
      this.namespace = namespace;
      this.debug = true;
      this.timeout = 30; // secs
      this.tmpDir = tmpDir;
      this.localMagicFilepath = `${tmpDir}/finished.txt`;
      this.command = command;
      this.providerName = providerName;
    }

    abstract createNamespace(): Promise<void>;
    abstract staticSetup(): Promise<void>;
    abstract destroyNamespace(): Promise<void>;
    abstract dumpLogs(path: string, podName: string): Promise<void>;
    abstract upsertCronJob(minutes: number): Promise<void>;
    abstract startPortForwarding(port: number, identifier: string): Promise<number>;
    abstract runCommand(args: string[], resourceDef?: string, scoped?: boolean): Promise<RunCommandResponse>
    abstract spawnFromDef(podDef: any, filesToCopy?: fileMap[] , filesToGet?: fileMap[]): Promise<void>;
    abstract copyFileFromPod(identifier: string, podFilePath: string, localFilePath: string, container?: string | undefined ): Promise<void>;
    abstract putLocalMagicFile(name: string, container?: string): Promise<void>;
    abstract createResource(resourseDef: any, scoped: boolean, waitReady: boolean): Promise<void>;
    abstract createPodMonitor(filename: string, chain: string): Promise<void>;
    abstract setupCleaner(): Promise<any>;
    abstract isPodMonitorAvailable(): Promise<boolean>;
    // abstract wait_transfer_container(podName: string): Promise<void>;
    // abstract wait_pod_ready(podName: string): Promise<void>;

};


let client: Client;
export function getClient(): Client {
  if (!client) throw new Error("Client not initialized");
  return client;
}

export function setClient(c: Client) {
    if(client) throw new Error("Client already initialized");
    client = c;
}
