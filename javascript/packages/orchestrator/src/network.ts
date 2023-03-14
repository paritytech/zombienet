import { CreateLogTable, decorators } from "@zombienet/utils";
import axios from "axios";
import fs from "fs";
import {
  BAKCCHANNEL_POD_NAME,
  BAKCCHANNEL_PORT,
  BAKCCHANNEL_URI_PATTERN,
  DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
} from "./constants";
import { Metrics } from "./metrics";
import { NetworkNode } from "./networkNode";
import { Client } from "./providers/client";
const debug = require("debug")("zombie::network");

export interface NodeMapping {
  [propertyName: string]: NetworkNode;
}

export interface NodeMappingMetrics {
  [propertyName: string]: Metrics;
}

export enum Scope {
  RELAY,
  PARA,
  COMPANION,
}

export function rebuildNetwork(
  client: Client,
  runningNetworkSpec: any,
): Network {
  const {
    namespace,
    tmpDir,
    companions,
    launched,
    backchannel,
    chainSpecFullPath,
    nodesByName,
    tracing_collator_url,
  } = runningNetworkSpec;
  const network: Network = new Network(client, namespace, tmpDir);
  Object.assign(network, {
    companions,
    launched,
    backchannel,
    chainSpecFullPath,
    tracing_collator_url,
  });

  for (const nodeName of Object.keys(nodesByName)) {
    const node = nodesByName[nodeName];
    const networkNode = new NetworkNode(
      node.name,
      node.wsUri,
      node.prometheusUri,
      node.userDefinedTypes,
    );

    if (node.parachainId) {
      if (!network.paras[node.parachainId])
        network.addPara(node.parachainId, node.parachainSpecPath);
      networkNode.parachainId = node.parachainId;
    }

    networkNode.group = node.group;
    network.addNode(networkNode, node.parachainId ? Scope.PARA : Scope.RELAY);
  }

  // ensure keep running by mark that was already running
  network.wasRunning = true;

  return network;
}

export class Network {
  relay: NetworkNode[] = [];
  paras: {
    [id: number]: {
      chainSpecPath?: string;
      wasmPath?: string;
      statePath?: string;
      nodes: NetworkNode[];
    };
  } = {};
  groups: {
    [id: string]: NetworkNode[];
  } = {};
  companions: NetworkNode[] = [];
  nodesByName: NodeMapping = {};
  namespace: string;
  client: Client;
  launched: boolean;
  wasRunning: boolean;
  tmpDir: string;
  backchannelUri: string = "";
  chainSpecFullPath?: string;
  tracing_collator_url?: string;
  networkStartTime?: number;

  constructor(client: Client, namespace: string, tmpDir: string) {
    this.client = client;
    this.namespace = namespace;
    this.launched = false;
    this.wasRunning = false;
    this.tmpDir = tmpDir;
  }

  addPara(
    parachainId: number,
    chainSpecPath?: string,
    wasmPath?: string,
    statePath?: string,
  ) {
    if (!this.paras[parachainId]) {
      this.paras[parachainId] = {
        nodes: [],
        chainSpecPath,
        wasmPath,
        statePath,
      };
    }
  }

  addNode(node: NetworkNode, scope: Scope) {
    if (scope === Scope.RELAY) this.relay.push(node);
    else if (scope == Scope.COMPANION) this.companions.push(node);
    else {
      if (!node.parachainId || !this.paras[node.parachainId])
        throw new Error(
          "Invalid network node configuration, collator must set the parachainId",
        );

      this.paras[node.parachainId].nodes.push(node);
    }

    this.nodesByName[node.name] = node;

    if (node.group) {
      if (!this.groups[node.group]) this.groups[node.group] = [];
      this.groups[node.group].push(node);
    }
  }

  async stop() {
    // Cleanup all api instances
    for (const node of Object.values(this.nodesByName))
      node.apiInstance?.disconnect();
    await this.client.destroyNamespace();
  }

  async dumpLogs(showLogPath: boolean = true): Promise<string> {
    const logsPath = this.tmpDir + "/logs";
    // create dump directory in local temp
    if (!fs.existsSync(logsPath)) fs.mkdirSync(logsPath);
    const paraNodes: NetworkNode[] = Object.values(this.paras).reduce(
      (memo: NetworkNode[], value) => memo.concat(value.nodes),
      [],
    );

    const dumpsPromises = this.relay.concat(paraNodes).map((node) => {
      this.client.dumpLogs(this.tmpDir, node.name);
    });
    await Promise.all(dumpsPromises);

    if (showLogPath)
      new CreateLogTable({ colWidths: [20, 100] }).pushToPrint([
        [decorators.green("Node's logs:"), decorators.magenta(logsPath)],
      ]);

    return logsPath;
  }

  async upsertCronJob(minutes = 10) {
    await this.client.upsertCronJob(minutes);
  }

  async getBackchannelValue(
    key: string,
    timeout: number = DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
  ): Promise<any> {
    let limitTimeout;
    let expired = false;
    let value;
    try {
      limitTimeout = setTimeout(() => {
        expired = true;
      }, timeout * 1000);

      if (!this.backchannelUri) {
        // create port-fw
        const port = await this.client.startPortForwarding(
          BAKCCHANNEL_PORT,
          BAKCCHANNEL_POD_NAME,
        );
        this.backchannelUri = BAKCCHANNEL_URI_PATTERN.replace(
          "{{PORT}}",
          port.toString(),
        );
      }

      let done = false;
      debug(`backchannel uri ${this.backchannelUri}`);
      while (!done) {
        if (expired) throw new Error(`Timeout(${timeout}s)`);
        const response = await axios.get(`${this.backchannelUri}/${key}`, {
          timeout: 2000,
          validateStatus: function (status) {
            debug(`status: ${status}`);
            return status === 404 || (status >= 200 && status < 300); // allow 404 as valid
          },
        });
        if (response.status === 200) {
          done = true;
          value = response.data;
          continue;
        }
        // wait 2 secs between checks
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      return value;
    } catch (err) {
      console.log(
        `\n ${decorators.red("Error: ")} \t ${decorators.bright(err)}\n`,
      );
      if (limitTimeout) clearTimeout(limitTimeout);
      throw err;
    }
  }

  getNodeByName(nodeName: string): NetworkNode {
    const node = this.nodesByName[nodeName];
    if (!node) throw new Error(`NODE: ${nodeName} not present`);
    return node;
  }

  getNodes(nodeOrGroupName: string): NetworkNode[] {
    //check if is a node
    const node = this.nodesByName[nodeOrGroupName];
    if (node) return [node];

    //check if is a group
    const nodes = this.groups[nodeOrGroupName];

    if (!nodes)
      throw new Error(`Noode or Group: ${nodeOrGroupName} not present`);
    return nodes;
  }

  node(nodeName: string): NetworkNode {
    const node = this.nodesByName[nodeName];
    if (!node) throw new Error(`NODE: ${nodeName} not present`);
    return node;
  }

  // Testing abstraction
  async nodeIsUp(
    nodeName: string,
    timeout = DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
  ): Promise<boolean> {
    try {
      const limitTimeout = setTimeout(() => {
        throw new Error(`Timeout(${timeout}s)`);
      }, timeout * 1000);

      const node = this.getNodeByName(nodeName);
      await node.apiInstance?.rpc.system.name();
      return true;
    } catch (err) {
      console.log(
        `\n ${decorators.red("Error: ")} \t ${decorators.bright(err)}\n`,
      );
      return false;
    }
  }

  // show links for access and debug
  showNetworkInfo(provider: string) {
    const logTable = new CreateLogTable({
      head: [
        {
          colSpan: 2,
          hAlign: "center",
          content: decorators.green("Network launched 🚀🚀"),
        },
      ],
      colWidths: [30, 170],
      wordWrap: true,
    });
    logTable.pushTo([
      ["Namespace", this.namespace],
      ["Provider", this.client.providerName],
    ]);

    for (const node of this.relay) {
      this.showNodeInfo(node, provider, logTable);
    }

    for (const [paraId, parachain] of Object.entries(this.paras)) {
      for (const node of parachain.nodes) {
        this.showNodeInfo(node, provider, logTable);
      }

      logTable.pushTo([[decorators.cyan("Parachain ID"), paraId]]);

      if (parachain.chainSpecPath)
        logTable.pushTo([
          [decorators.cyan("ChainSpec Path"), parachain.chainSpecPath],
        ]);
    }

    if (this.companions.length) {
      logTable.pushTo([
        [
          {
            colSpan: 2,
            content: "Companions",
          },
        ],
      ]);
      for (const node of this.companions) {
        this.showNodeInfo(node, provider, logTable);
      }
    }
    logTable.print();
  }

  showNodeInfo(node: NetworkNode, provider: string, logTable: CreateLogTable) {
    // Support native VSCode remote extension automatic port forwarding.
    // VSCode doesn't parse the encoded URI and we have no reason to encode
    // `localhost:port`.
    let wsUri = ["native", "podman"].includes(provider)
      ? node.wsUri
      : encodeURIComponent(node.wsUri);

    let logCommand: string = "";

    switch (this.client.providerName) {
      case "podman":
        logCommand = `podman logs -f ${node.name}_pod-${node.name}`;
        break;
      case "kubernetes":
        logCommand = `kubectl logs -f ${node.name} -c ${node.name} -n ${this.client.namespace}`;
        break;
      case "native":
        logCommand = `tail -f  ${this.client.tmpDir}/${node.name}.log`;
        break;
    }

    logTable.pushTo([
      [{ colSpan: 2, hAlign: "center", content: "Node Information" }],
      [decorators.cyan("Name"), decorators.green(node.name)],
      [
        decorators.cyan("Direct Link"),
        `https://polkadot.js.org/apps/?rpc=${wsUri}#/explorer`,
      ],
      [decorators.cyan("Prometheus Link"), node.prometheusUri],
      [decorators.cyan("Log Cmd"), logCommand],
    ]);
  }

  replaceWithNetworInfo(placeholder: string): string {
    return placeholder.replace(
      /{{ZOMBIE:(.*?):(.*?)}}/gi,
      (_substring, nodeName, key: keyof NetworkNode) => {
        const node = this.getNodeByName(nodeName);
        return node[key];
      },
    );
  }
}
