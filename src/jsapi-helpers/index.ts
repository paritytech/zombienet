import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { readDataFile } from "../utils/fs";
import {
  chainCustomSectionUpgrade,
  chainUpgradeFromLocalFile,
  chainUpgradeFromUrl,
  validateRuntimeCode,
} from "./chain-upgrade";
import { findPatternInSystemEventSubscription } from "./events";
import { paraGetBlockHeight, paraIsRegistered } from "./parachain";

async function connect(apiUrl: string, types?: any): Promise<ApiPromise> {
  const provider = new WsProvider(apiUrl);
  const api = new ApiPromise({ provider, types });
  await api.isReady;
  return api;
}

async function registerParachain(
  id: number,
  wasmPath: string,
  statePath: string,
  apiUrl: string,
  finalization = false,
) {
  return new Promise<void>(async (resolve, reject) => {
    await cryptoWaitReady();

    const keyring = new Keyring({ type: "sr25519" });
    const alice = keyring.addFromUri("//Alice");
    let api: ApiPromise = await connect(apiUrl);

    let nonce = (
      (await api.query.system.account(alice.address)) as any
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
      `Submitting extrinsic to register parachain ${id}. nonce: ${nonce}`,
    );

    const unsub = await api.tx.sudo
      .sudo(api.tx.parasSudoWrapper.sudoScheduleParaInitialize(id, genesis))
      .signAndSend(alice, { nonce: nonce, era: 0 }, (result) => {
        console.log(`Current status is ${result.status}`);
        if (result.status.isInBlock) {
          console.log(
            `Transaction included at blockhash ${result.status.asInBlock}`,
          );
          if (finalization) {
            console.log("Waiting for finalization...");
          } else {
            unsub();
            return resolve();
          }
        } else if (result.status.isFinalized) {
          console.log(
            `Transaction finalized at blockHash ${result.status.asFinalized}`,
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

export {
  connect,
  registerParachain,
  chainUpgradeFromLocalFile,
  chainUpgradeFromUrl,
  chainCustomSectionUpgrade,
  validateRuntimeCode,
  paraGetBlockHeight,
  paraIsRegistered,
  findPatternInSystemEventSubscription,
};
