import { ApiPromise, WsProvider } from "@polkadot/api";
import {
  chainUpgrade,
  chainCustomSectionUpgrade,
  validateRuntimeCode,
} from "./chain-upgrade";
import { paraGetBlockHeight, paraIsRegistered } from "./parachain";
import { findPatternInSystemEventSubscription } from "./events";

async function connect(apiUrl: string, types: any): Promise<ApiPromise> {
  const provider = new WsProvider(apiUrl);
  const api = new ApiPromise({ provider, types });
  await api.isReady;
  return api;
}

export {
  connect,
  chainUpgrade,
  chainCustomSectionUpgrade,
  validateRuntimeCode,
  paraGetBlockHeight,
  paraIsRegistered,
  findPatternInSystemEventSubscription
};
