import { KubeClient } from "./providers/k8s";
import { cryptoWaitReady, keyExtractPath } from "@polkadot/util-crypto";
import { Keyring } from "@polkadot/keyring";
import { ApiPromise } from "@polkadot/api";
import { readDataFile } from "./utils";
import { DEFAULT_INDIVIDUAL_TEST_TIMEOUT, ZOMBIE_BUCKET } from "./configManager";
import { Metrics } from "./metrics";
import { NetworkNode } from "./networkNode";
import fs  from "fs";
import execa from "execa";

export interface NodeMapping {
  [propertyName: string]: NetworkNode;
}

export interface NodeMappingMetrics {
  [propertyName: string]: Metrics;
}

export class Network {
  nodes: NetworkNode[] = [];
  nodesByName: NodeMapping = {};
  namespace: string;
  client: KubeClient;
  launched: boolean;
  tmpDir: string;

  constructor(client: KubeClient, namespace: string, tmpDir: string) {
    this.client = client;
    this.namespace = namespace;
    this.launched = false;
    this.tmpDir = tmpDir;
  }

  addNode(node: NetworkNode) {
    this.nodes.push(node);
    this.nodesByName[node.name] = node;
  }

  async stop() {
    await this.client.destroyNamespace();
  }

  async uploadLogs() {
    // create dump directory in local temp
    fs.mkdirSync(`${this.tmpDir}/logs`);
    const dumpsPromises = this.nodes.map(node => {
      node.client.dumpLogs(this.tmpDir, node.name);
    });
    await Promise.all(dumpsPromises);
    const args = ["cp", "-r", `${this.tmpDir}/*`, `gs://${ZOMBIE_BUCKET}/${this.namespace}/`]
    await execa("gsutil", args);
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
      const api: ApiPromise =
        apiInstance || (this.nodes[0].apiInstance as ApiPromise);
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
      await node.apiInstance.rpc.system.name();
      return true;
    } catch (err) {
      console.log(err);
      return false;
    }
  }
}
