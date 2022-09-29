import { ApiPromise, WsProvider } from "@polkadot/api";
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
