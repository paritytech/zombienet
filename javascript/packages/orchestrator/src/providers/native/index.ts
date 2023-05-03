import { getChainSpecRaw, setupChainSpec } from "./chainSpec";
import {
  genBootnodeDef,
  genNodeDef,
  replaceNetworkRef,
} from "./dynResourceDefinition";
import { NativeClient, initClient } from "./nativeClient";
import { setSubstrateCliArdsVersion } from "./substrateCliArgsHelper";

export const provider = {
  NativeClient,
  genBootnodeDef,
  genNodeDef,
  initClient,
  setupChainSpec,
  getChainSpecRaw,
  replaceNetworkRef,
  setSubstrateCliArdsVersion,
};
