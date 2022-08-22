import { KubeClient, initClient } from "./kubeClient";
import {
  genBootnodeDef,
  genNodeDef,
  replaceNetworkRef,
} from "./dynResourceDefinition";
import { setupChainSpec, getChainSpecRaw } from "./chain-spec";

export const provider = {
  KubeClient,
  genBootnodeDef,
  genNodeDef,
  initClient,
  setupChainSpec,
  getChainSpecRaw,
  replaceNetworkRef,
};
