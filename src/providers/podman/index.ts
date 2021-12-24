import { PodmanClient, initClient } from "./podmanClient";
import { genBootnodeDef, genPodDef } from "./dynResourceDefinition";
import { setupChainSpec } from "./chain-spec";

export const provider = { PodmanClient, genBootnodeDef, genPodDef, initClient, setupChainSpec };
