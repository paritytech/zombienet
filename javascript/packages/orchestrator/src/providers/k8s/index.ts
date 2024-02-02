import { getChainSpecRaw, setupChainSpec } from "./chainSpec";
import {
  genBootnodeDef,
  genNodeDef,
  replaceNetworkRef,
  genChaosDef,
} from "./dynResourceDefinition";
import { KubeClient, initClient } from "./kubeClient";
import { getCliArgsHelp } from "./substrateCliArgsHelper";

export const provider = {
  KubeClient,
  genBootnodeDef,
  genNodeDef,
  initClient,
  setupChainSpec,
  getChainSpecRaw,
  replaceNetworkRef,
  getCliArgsHelp,
  genChaosDef,
};
