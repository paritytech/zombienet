import { getChainSpecRaw, setupChainSpec } from "./chain-spec";
import {
  genBootnodeDef,
  genNodeDef,
  replaceNetworkRef,
} from "./dynResourceDefinition";
import { initClient, KubeClient } from "./kubeClient";

export const provider = {
  KubeClient,
  genBootnodeDef,
  genNodeDef,
  initClient,
  setupChainSpec,
  getChainSpecRaw,
  replaceNetworkRef,
};
