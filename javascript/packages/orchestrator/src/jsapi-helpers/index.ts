import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { readDataFile } from "@zombienet/utils";
import { RegisterParachainOptions } from "../types";
import {
  chainCustomSectionUpgrade,
  chainUpgradeFromLocalFile,
  chainUpgradeFromUrl,
  validateRuntimeCode,
} from "./chainUpgrade";
import { findPatternInSystemEventSubscription } from "./events";
import { paraGetBlockHeight, paraIsRegistered } from "./parachain";

async function connect(apiUrl: string, types?: any): Promise<ApiPromise> {
  const provider = new WsProvider(apiUrl);
  const api = new ApiPromise({ provider, types });
  await api.isReady;
  return api;
}

async function registerParachain({
  id,
  wasmPath,
  statePath,
  apiUrl,
  onboardAsParachain,
  seed = "//Alice",
  finalization = false,
}: RegisterParachainOptions) {
  return new Promise<void>(async (resolve, reject) => {
    await cryptoWaitReady();

    const keyring = new Keyring({ type: "sr25519" });
    const sudo = keyring.addFromUri(seed);
    const api: ApiPromise = await connect(apiUrl);

    let nonce = (
      (await api.query.system.account(sudo.address)) as any
    ).nonce.toNumber();
    const wasm_data = readDataFile(wasmPath);
    const genesis_state = readDataFile(statePath);

    const parachainGenesisArgs = {
      genesis_head: genesis_state,
      validation_code: wasm_data,
      parachain: onboardAsParachain,
    };

    const genesis = api.createType("ParaGenesisArgs", parachainGenesisArgs);

    console.log(
      `Submitting extrinsic to register parachain ${id}. nonce: ${nonce}`,
    );

    const unsub = await api.tx.sudo
      .sudo(api.tx.parasSudoWrapper.sudoScheduleParaInitialize(id, genesis))
      .signAndSend(sudo, { nonce: nonce, era: 0 }, (result) => {
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
  chainCustomSectionUpgrade,
  chainUpgradeFromLocalFile,
  chainUpgradeFromUrl,
  connect,
  findPatternInSystemEventSubscription,
  paraGetBlockHeight,
  paraIsRegistered,
  registerParachain,
  validateRuntimeCode,
};
