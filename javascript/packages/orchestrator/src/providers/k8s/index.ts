import { getChainSpecRaw, setupChainSpec } from "./chainSpec";
import {
  genBootnodeDef,
  genNodeDef,
  replaceNetworkRef,
} from "./dynResourceDefinition";
import { KubeClient, initClient } from "./kubeClient";
import { setSubstrateCliArdsVersion } from "./substrateCliArgsHelper";

export const provider = {
  KubeClient,
  genBootnodeDef,
  genNodeDef,
  initClient,
  setupChainSpec,
  getChainSpecRaw,
  replaceNetworkRef,
  setSubstrateCliArdsVersion,
};
