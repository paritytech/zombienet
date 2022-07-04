import { ApiPromise, WsProvider } from "@polkadot/api";
import {
  chainUpgradeFromLocalFile,
  chainUpgradeFromUrl,
  chainCustomSectionUpgrade,
  validateRuntimeCode,
} from "./chain-upgrade.ts";
import { paraGetBlockHeight, paraIsRegistered } from "./parachain.ts";
import { findPatternInSystemEventSubscription } from "./events.ts";

async function connect(apiUrl: string, types: any): Promise<ApiPromise> {
  const provider = new WsProvider(apiUrl);
  const api = new ApiPromise({ provider, types });
  await api.isReady;
  return api;
}

export {
  connect,
  chainUpgradeFromLocalFile,
  chainUpgradeFromUrl,
  chainCustomSectionUpgrade,
  validateRuntimeCode,
  paraGetBlockHeight,
  paraIsRegistered,
  findPatternInSystemEventSubscription,
};
