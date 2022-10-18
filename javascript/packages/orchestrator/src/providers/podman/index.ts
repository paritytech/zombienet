import { getChainSpecRaw, setupChainSpec } from "./chain-spec";
import {
  genBootnodeDef,
  genNodeDef,
  replaceNetworkRef,
} from "./dynResourceDefinition";
import { initClient, PodmanClient } from "./podmanClient";

export const provider = {
  PodmanClient,
  genBootnodeDef,
  genNodeDef,
  initClient,
  setupChainSpec,
  getChainSpecRaw,
  replaceNetworkRef,
};
