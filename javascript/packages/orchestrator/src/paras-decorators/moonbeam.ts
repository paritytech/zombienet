import { Keyring } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { CreateLogTable, decorators } from "@zombienet/utils";
import {
  clearAuthorities as _clearAuthorities,
  specHaveSessionsKeys as _specHaveSessionsKeys,
  getRuntimeConfig,
  readAndParseChainSpec,
  writeChainSpec,
} from "../chain-spec";
import { generateKeyForNode as _generateKeyForNode } from "../keys";
import { ChainSpec, Node } from "../types";

// track 1st staking as default;
let paraStakingBond: number | undefined;

export type GenesisNodeKey = [string, string];

const KNOWN_MOONBEAM_KEYS: { [name: string]: string } = {
  alith: "0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133",
  baltathar:
    "0x8075991ce870b93a8870eca0c0f91913d12f47948ca0fd25b49c6fa7cdbeee8b",
  charleth:
    "0x0b6e18cafb6ed99687ec547bd28139cafdd2bffe70e6b688025de6b445aa5c5b",
  dorothy: "0x39539ab1876910bbf3a223d84a29e28f1cb4e2e456503e7e91ed39b2e7223d68",
  ethan: "0x7dce9bc8babb68fec1409be38c8e1a52650206a7ed90ff956ae8a6d15eeaaef4",
  faith: "0xb9d2ea9a615f3165812e8d44de0d24da9bbd164b65c4f0573e1ce2c8dbd9c8df",
  goliath: "0x96b8a38e12e1a31dee1eab2fffdf9d9990045f5b37e44d8cc27766ef294acf18",
  heath: "0x0d6dcaaef49272a5411896be8ad16c01c35d6f8c18873387b71fbc734759b0ab",
  ida: "0x4c42532034540267bf568198ccec4cb822a025da542861fcb146a5fab6433ff8",
  judith: "0x94c49300a58d576011096bcb006aa06f5a91b34b4383891e8029c21dc39fbb8b",
};

function specHaveSessionsKeys(chainSpec: ChainSpec) {
  const keys = _specHaveSessionsKeys(chainSpec);

  return keys || getRuntimeConfig(chainSpec)?.authorMapping;
}

function getAuthorityKeys(chainSpec: ChainSpec) {
  return getRuntimeConfig(chainSpec)?.authorMapping?.mappings;
}

async function addAuthority(specPath: string, node: Node, key: GenesisNodeKey) {
  const chainSpec = readAndParseChainSpec(specPath);

  const { sr_account } = node.accounts;

  const keys = getAuthorityKeys(chainSpec);
  if (!keys) return;

  keys.push(key);

  new CreateLogTable({
    colWidths: [30, 20, 70],
  }).pushToPrint([
    [
      decorators.cyan("👤 Added Genesis Authority"),
      decorators.green(node.name),
      decorators.magenta(sr_account.address),
    ],
  ]);

  new CreateLogTable({
    colWidths: [120],
  }).pushToPrint(chainSpec.genesis.runtime.authorMapping);

  writeChainSpec(specPath, chainSpec);
}

async function clearAuthorities(specPath: string) {
  await _clearAuthorities(specPath);

  const chainSpec = readAndParseChainSpec(specPath);
  const runtimeConfig = getRuntimeConfig(chainSpec);

  // clear authorMapping
  if (runtimeConfig?.authorMapping)
    runtimeConfig.authorMapping.mappings.length = 0;

  // clear parachainStaking
  if (runtimeConfig?.parachainStaking) {
    paraStakingBond = runtimeConfig.parachainStaking.candidates[0][1];
    runtimeConfig.parachainStaking.candidates.length = 0;
    runtimeConfig.parachainStaking.delegations.length = 0;
  }

  writeChainSpec(specPath, chainSpec);
}

async function generateKeyForNode(nodeName?: string): Promise<any> {
  const keys = await _generateKeyForNode(nodeName);

  await cryptoWaitReady();

  const eth_keyring = new Keyring({ type: "ethereum" });
  const eth_account = eth_keyring.createFromUri(
    nodeName && nodeName.toLocaleLowerCase() in KNOWN_MOONBEAM_KEYS
      ? KNOWN_MOONBEAM_KEYS[nodeName.toLocaleLowerCase()]
      : `${keys.mnemonic}/m/44'/60'/0'/0/0`,
  );

  keys.eth_account = {
    address: eth_account.address,
    publicKey: u8aToHex(eth_account.publicKey),
  };

  return keys;
}

export function getNodeKey(node: Node, useStash = true): GenesisNodeKey {
  const { sr_account, eth_account } = node.accounts;

  return [sr_account.address, eth_account.address];
}

async function addParaCustom(specPath: string, node: Node) {
  const chainSpec = readAndParseChainSpec(specPath);
  const runtimeConfig = getRuntimeConfig(chainSpec);

  // parachainStaking
  if (!runtimeConfig?.parachainStaking) return;

  const { sr_account, eth_account } = node.accounts;

  runtimeConfig.parachainStaking.candidates.push([
    eth_account.address,
    paraStakingBond || 1000000000000,
  ]);

  writeChainSpec(specPath, chainSpec);
}

function getProcessStartTimeKey() {
  return "moonbeam_substrate_process_start_time_seconds";
}

export default {
  specHaveSessionsKeys,
  addAuthority,
  clearAuthorities,
  generateKeyForNode,
  addParaCustom,
  getAuthorityKeys,
  getNodeKey,
  getProcessStartTimeKey,
};
