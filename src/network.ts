import { Client } from "./providers/client";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { Keyring } from "@polkadot/keyring";
import { ApiPromise } from "@polkadot/api";
import { readDataFile } from "./utils";
import {
  BAKCCHANNEL_POD_NAME,
  BAKCCHANNEL_PORT,
  BAKCCHANNEL_URI_PATTERN,
  DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
  ZOMBIE_BUCKET,
} from "./constants";
import { Metrics } from "./metrics";
import { NetworkNode } from "./networkNode";
import fs from "fs";
import execa from "execa";
import axios from "axios";
import { decorators } from "./colors";
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
}

export class Network {
  relay: NetworkNode[] = [];
  paras: { [id: number]: {
    spec?: string,
    nodes: NetworkNode[]
  } } = {};
  nodesByName: NodeMapping = {};
  namespace: string;
  client: Client;
  launched: boolean;
  tmpDir: string;
  backchannelUri: string = "";
  chainSpecFullPath?: string;

  constructor(client: Client, namespace: string, tmpDir: string) {
    this.client = client;
    this.namespace = namespace;
    this.launched = false;
    this.tmpDir = tmpDir;
  }

  addPara(parachainId: number, spec?: string) {
    if(!this.paras[parachainId]) {
      this.paras[parachainId] = {
        nodes: [],
        spec
      };
    }
  }

  addNode(node: NetworkNode, scope: Scope) {
    if (scope === Scope.RELAY) this.relay.push(node);
    else {
      if (!node.parachainId || !this.paras[node.parachainId])
        throw new Error(
          "Invalid network node configuration, collator must set the parachainId"
        );

      this.paras[node.parachainId].nodes.push(node);
    }

    this.nodesByName[node.name] = node;
  }

  async stop() {
    await this.client.destroyNamespace();
  }

  async uploadLogs() {
    // create dump directory in local temp
    fs.mkdirSync(`${this.tmpDir}/logs`);
    const paraNodes: NetworkNode[] = Object.keys(this.paras).reduce(
      (memo: NetworkNode[], key) => {
        const paraId = parseInt(key, 10);
        memo.concat(this.paras[paraId].nodes);
        return memo;
      },
      []
    );

    const dumpsPromises = this.relay.concat(paraNodes).map((node) => {
      this.client.dumpLogs(this.tmpDir, node.name);
    });
    await Promise.all(dumpsPromises);
    const args = [
      "cp",
      "-r",
      `${this.tmpDir}/*`,
      `gs://${ZOMBIE_BUCKET}/${this.namespace}/`,
    ];
    try {
      await execa("gsutil", args);
    } catch (err) {
      console.log(
        `\n\t ${decorators.red(
          "Could NOT upload logs"
        )} to ${ZOMBIE_BUCKET} bucket, check if you have access and gsutil installed.`
      );
    }
  }

  async upsertCronJob(minutes = 10) {
    await this.client.upsertCronJob(minutes);
  }

  async registerParachain(
    id: number,
    wasmPath: string,
    statePath: string,
    apiInstance = null,
    finalization = false
  ) {
    return new Promise<void>(async (resolve, reject) => {
      await cryptoWaitReady();

      const keyring = new Keyring({ type: "sr25519" });
      const alice = keyring.addFromUri("//Alice");
      let api: ApiPromise;
      if (apiInstance) api = apiInstance;
      else {
        if (!this.relay[0].apiInstance) await this.relay[0].connectApi();
        // now should be connected
        api = this.relay[0].apiInstance as ApiPromise;
      }

      let nonce = (
        await api.query.system.account(alice.address)
      ).nonce.toNumber();
      const wasm_data = readDataFile(wasmPath);
      const genesis_state = readDataFile(statePath);

      const parachainGenesisArgs = {
        genesis_head: genesis_state,
        validation_code: wasm_data,
        parachain: true,
      };

      const genesis = api.createType("ParaGenesisArgs", parachainGenesisArgs);

      console.log(
        `Submitting extrinsic to register parachain ${id}. nonce: ${nonce}`
      );

      const unsub = await api.tx.sudo
        .sudo(api.tx.parasSudoWrapper.sudoScheduleParaInitialize(id, genesis))
        .signAndSend(alice, { nonce: nonce, era: 0 }, (result) => {
          console.log(`Current status is ${result.status}`);
          if (result.status.isInBlock) {
            console.log(
              `Transaction included at blockhash ${result.status.asInBlock}`
            );
            if (finalization) {
              console.log("Waiting for finalization...");
            } else {
              unsub();
              return resolve();
            }
          } else if (result.status.isFinalized) {
            console.log(
              `Transaction finalized at blockHash ${result.status.asFinalized}`
            );
            unsub();
            return resolve();
          } else if (result.isError) {
            console.log(`Transaction error`);
            reject(`Transaction error`);
          }
        });

      nonce += 1;
    });
  }

  async getBackchannelValue(
    key: string,
    timeout: number = DEFAULT_INDIVIDUAL_TEST_TIMEOUT
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
          BAKCCHANNEL_POD_NAME
        );
        this.backchannelUri = BAKCCHANNEL_URI_PATTERN.replace(
          "{{PORT}}",
          port.toString()
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
      console.log(err);
      if (limitTimeout) clearTimeout(limitTimeout);
      throw err;
    }
  }

  getNodeByName(nodeName: string): NetworkNode {
    const node = this.nodesByName[nodeName];
    if (!node) throw new Error(`NODE: ${nodeName} not present`);
    return node;
  }

  node(nodeName: string): NetworkNode {
    const node = this.nodesByName[nodeName];
    if (!node) throw new Error(`NODE: ${nodeName} not present`);
    return node;
  }

  // Testing abstraction
  async nodeIsUp(
    nodeName: string,
    timeout = DEFAULT_INDIVIDUAL_TEST_TIMEOUT
  ): Promise<boolean> {
    try {
      const limitTimeout = setTimeout(() => {
        throw new Error(`Timeout(${timeout}s)`);
      }, timeout * 1000);

      const node = this.getNodeByName(nodeName);
      await node.apiInstance?.rpc.system.name();
      return true;
    } catch (err) {
      console.log(err);
      return false;
    }
  }

  // show links for access and debug
  showNetworkInfo(provider: String) {
    console.log("\n-----------------------------------------\n");
    console.log("\n\t Network launched 🚀🚀");
    console.log(
      `\n\t\t In namespace ${this.namespace} with ${this.client.providerName} provider`
    );
    for (const node of this.relay) {
      this.showNodeInfo(node, provider);
    }

    for (const [paraId, parachain] of Object.entries(this.paras)) {
      console.log("\n");
      console.log("\n\t Parachain ID: " + paraId);
      if(parachain.spec) console.log("\n\t Parachain spec path: " + parachain.spec);

      for (const node of parachain.nodes) {
        this.showNodeInfo(node, provider);
      }
    }
  }

  showNodeInfo(node: NetworkNode, provider: String) {
    console.log("\n");
    console.log(`\t\t Node name: ${decorators.green(node.name)}\n`);

    // Support native VSCode remote extension automatic port forwarding.
    // VSCode doesn't parse the encoded URI and we have no reason to encode
    // `localhost:port`.
    let wsUri =
      provider === "native" ? node.wsUri : encodeURIComponent(node.wsUri);
    console.log(
      `\t\t Node direct link: https://polkadot.js.org/apps/?rpc=${wsUri}#/explorer\n`
    );
    console.log(`\t\t Node prometheus link: ${node.prometheusUri}\n`);
    console.log("---\n");
  }
}
