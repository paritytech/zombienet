import { getChainSpecRaw, setupChainSpec } from "./chainSpec";
import {
  genBootnodeDef,
  genNodeDef,
  replaceNetworkRef,
} from "./dynResourceDefinition";
import { PodmanClient, initClient } from "./podmanClient";

export const provider = {
  PodmanClient,
  genBootnodeDef,
  genNodeDef,
  initClient,
  setupChainSpec,
  getChainSpecRaw,
  replaceNetworkRef,
};
