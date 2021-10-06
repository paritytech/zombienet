import { KubeClient } from "./kubeWrapper";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { Keyring } from "@polkadot/keyring";
import { ApiPromise } from "@polkadot/api";
import { readDataFile } from "./utils";
import { DEFAULT_INDIVIDUAL_TEST_TIMEOUT } from "./configManager";
import { Metrics } from "./metrics";
import { NetworkNode } from "./networkNode";


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
  // cachedMetricByNode: NodeMappingMetrics;

  constructor(client: KubeClient, namespace: string) {
    this.client = client;
    this.namespace = namespace;
    this.launched = false;
    // this.cachedMetricByNode = {}
  }

  addNode(node: NetworkNode) {
    this.nodes.push(node);
    this.nodesByName[node.name] = node;
  }

  async stop() {
    await this.client.destroyNamespace();
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
    if( ! node ) throw new Error(`NODE: ${nodeName} not present`);
    return node;
  }

  node(nodeName: string): NetworkNode {
    const node = this.nodesByName[nodeName];
    if( ! node ) throw new Error(`NODE: ${nodeName} not present`);
    return node;
  }

  // Testing abstraction
  async nodeIsUp(nodeName: string, timeout=DEFAULT_INDIVIDUAL_TEST_TIMEOUT): Promise<boolean> {
    try{
      const limitTimeout = setTimeout(() => {
        throw new Error(`Timeout(${timeout}s)`);
      }, timeout * 1000 );

      const node = this.getNodeByName(nodeName);
      await node.apiInstance.rpc.system.name();
      return true;
    } catch( err ) {
      console.log(err);
      return false;
    }
  }

  // abstract over prometheus metrics
  // if `desiredMetricValue` is passed keep getting the metrics until we get the value or the `timeout` is reached.
  // async report(nodeName: string, metricName: string, desiredMetricValue: number|null = null, timeout=DEFAULT_INDIVIDUAL_TEST_TIMEOUT): Promise<number> {
  //   const limitTimeout = setTimeout(() => {
  //     throw new Error(`Timeout(${timeout}s)`);
  //   }, timeout * 1000 );

  //   const node = this.getNodeByName(nodeName);

  //   const getMetric = async (useCache:boolean): Promise<number> => {
  //     return await node.getMetric(metricName, useCache);
  //   }

  //   let value = await getMetric(desiredMetricValue === null );
  //   if( desiredMetricValue === null || desiredMetricValue >= value ) return value;

  //   // loop until get the desired value or timeout
  //   let done = false;
  //   while (!done) {
  //     await new Promise((resolve) => setTimeout(resolve, 500));
  //     value = await getMetric(false);
  //     if( desiredMetricValue >= value ) {
  //       clearTimeout(limitTimeout);
  //       done = true;
  //     }
  //   }
  //   return value;
  // }
}