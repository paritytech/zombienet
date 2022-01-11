import { PodmanClient, initClient } from "./podmanClient";
import { genBootnodeDef, genNodeDef } from "./dynResourceDefinition";
import { setupChainSpec, getChainSpecRaw } from "./chain-spec";

export const provider = {
  PodmanClient,
  genBootnodeDef,
  genNodeDef,
  initClient,
  setupChainSpec,
  getChainSpecRaw,
};
