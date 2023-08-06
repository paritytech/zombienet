import {
  clearAuthorities as _clearAuthorities,
  getRuntimeConfig,
  readAndParseChainSpec,
  writeChainSpec,
} from "../chainSpec";
import { Node } from "../types";

// Track 1st staking bond as default
let paraStakingBond: number | undefined;

export type GenesisNodeKey = [string, string, { [key: string]: string }];

export function getNodeKey(node: Node): GenesisNodeKey {
  const { sr_account } = node.accounts;

  const address = sr_account.address;

  const key: GenesisNodeKey = [
    address,
    address,
    {
      aura: address,
    },
  ];

  return key;
}

async function clearAuthorities(specPath: string) {
  await _clearAuthorities(specPath);

  const chainSpec = readAndParseChainSpec(specPath);
  const runtimeConfig = getRuntimeConfig(chainSpec);

  // Clear parachainStaking candidates
  if (runtimeConfig?.parachainStaking) {
    paraStakingBond = runtimeConfig.parachainStaking.candidates[0][1];
    runtimeConfig.parachainStaking.candidates.length = 0;
    runtimeConfig.parachainStaking.delegations.length = 0;
  }

  writeChainSpec(specPath, chainSpec);
}

async function addParaCustom(specPath: string, node: Node) {
  const chainSpec = readAndParseChainSpec(specPath);
  const runtimeConfig = getRuntimeConfig(chainSpec);

  if (!runtimeConfig?.parachainStaking) return;

  const { sr_account } = node.accounts;
  const stakingBond = paraStakingBond || 1000000000000;

  // Ensure collator account has enough balance to bond and add candidate
  runtimeConfig.tokens.tokensEndowment.push([
    sr_account.address,
    0,
    stakingBond,
  ]);
  runtimeConfig.parachainStaking.candidates.push([
    sr_account.address,
    stakingBond,
    0,
  ]);

  writeChainSpec(specPath, chainSpec);
}

export default {
  getNodeKey,
  clearAuthorities,
  addParaCustom,
};
