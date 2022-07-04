import { NativeClient, initClient } from "./nativeClient.ts";
import { genBootnodeDef, genNodeDef, replaceMultiAddresReferences } from "./dynResourceDefinition.ts";
import { setupChainSpec, getChainSpecRaw } from "./chain-spec.ts";

export const provider = {
  NativeClient,
  genBootnodeDef,
  genNodeDef,
  initClient,
  setupChainSpec,
  getChainSpecRaw,
  replaceMultiAddresReferences
};
