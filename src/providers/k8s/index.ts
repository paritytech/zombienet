import { KubeClient, initClient } from "./kubeClient";
import { genBootnodeDef, genPodDef } from "./dynResourceDefinition";
import { setupChainSpec, getChainSpecRaw } from "./chain-spec";

export const provider = { KubeClient, genBootnodeDef, genPodDef, initClient, setupChainSpec, getChainSpecRaw };
