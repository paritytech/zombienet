import { PodmanClient, initClient } from "./podmanClient.ts";
import { genBootnodeDef, genNodeDef, replaceMultiAddresReferences } from "./dynResourceDefinition.ts";
import { setupChainSpec, getChainSpecRaw } from "./chain-spec.ts";

export const provider = {
  PodmanClient,
  genBootnodeDef,
  genNodeDef,
  initClient,
  setupChainSpec,
  getChainSpecRaw,
  replaceMultiAddresReferences,
};
