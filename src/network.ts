import { KubeClient } from "./kubeWrapper";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { Keyring } from "@polkadot/keyring";
import { ApiPromise } from "@polkadot/api";
import { readDataFile } from "./utils";

export interface NetworkNode {
  name: string;
  wsUri: string;
  apiInstance?: ApiPromise;
  spec?: object;
  autoConnectApi: boolean;
}

export interface NodeMapping {
  [propertyName: string]: NetworkNode;
}

export class Network {
  nodes: NetworkNode[] = [];
  nodesByName: NodeMapping = {};
  namespace: string;
  client: KubeClient;
  launched: boolean;

  constructor(client: KubeClient, namespace: string) {
    this.client = client;
    this.namespace = namespace;
    this.launched = false;
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
}
