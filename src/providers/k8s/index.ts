import { KubeClient, initClient } from "./kubeClient.ts";
import { genBootnodeDef, genNodeDef, replaceMultiAddresReferences } from "./dynResourceDefinition.ts";
import { setupChainSpec, getChainSpecRaw } from "./chain-spec.ts";

export const provider = {
  KubeClient,
  genBootnodeDef,
  genNodeDef,
  initClient,
  setupChainSpec,
  getChainSpecRaw,
  replaceMultiAddresReferences,
};
