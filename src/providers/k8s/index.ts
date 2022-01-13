import { KubeClient, initClient } from "./kubeClient";
import { genBootnodeDef, genNodeDef } from "./dynResourceDefinition";
import { setupChainSpec, getChainSpecRaw } from "./chain-spec";

export const provider = {
  KubeClient,
  genBootnodeDef,
  genNodeDef,
  initClient,
  setupChainSpec,
  getChainSpecRaw,
};
