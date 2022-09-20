import { ChainSpec } from "../types";
import {
    getRuntimeConfig,
    specHaveSessionsKeys as _specHaveSessionsKeys,
    clearAuthorities as _clearAuthorities,
    KeyType,
    GenesisNodeKey,
    readAndParseChainSpec,
    writeChainSpec
} from "../chain-spec";
import {  Node } from "../types";


// track 1st staking as default;
let paraStakingBond: number | undefined;

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
    let keys = _specHaveSessionsKeys(chainSpec);

    const runtimeConfig = getRuntimeConfig(chainSpec);
    return keys || runtimeConfig?.authorMapping;
}

function getAuthorityKeys(chainSpec: ChainSpec) {
    const runtimeConfig = getRuntimeConfig(chainSpec);
    if (runtimeConfig?.authorMapping) return runtimeConfig.authorMapping.mappings;
}

async function addAuthority(
    specPath: string,
    node: Node,
    key: GenesisNodeKey
  ) {

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

}


async function addParaCustom( specPath: string, node: Node) {
  const chainSpec = readAndParseChainSpec(specPath);
  const runtimeConfig = getRuntimeConfig(chainSpec);

  // parachainStaking
  if (! runtimeConfig?.parachainStaking) return;

  const { sr_account, eth_account } = node.accounts;

  runtimeConfig.parachainStaking.candidates.push([
    eth_account.address,
    paraStakingBond || 1000000000000,
  ]);

  writeChainSpec(specPath, chainSpec);
}
export default {
    specHaveSessionsKeys,
    addAuthority,
    clearAuthorities,
    generateKeyForNode,
    addParaCustom,
    getAuthorityKeys
}