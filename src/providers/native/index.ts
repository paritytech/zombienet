import { NativeClient, initClient } from "./nativeClient";
import { genBootnodeDef, genNodeDef, replaceMultiAddresReferences } from "./dynResourceDefinition";
import { setupChainSpec, getChainSpecRaw } from "./chain-spec";

export const provider = {
  NativeClient,
  genBootnodeDef,
  genNodeDef,
  initClient,
  setupChainSpec,
  getChainSpecRaw,
  replaceMultiAddresReferences
};
