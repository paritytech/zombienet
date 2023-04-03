import {
  clearAuthorities as _clearAuthorities,
  getRuntimeConfig,
  readAndParseChainSpec,
  writeChainSpec,
} from "../chain-spec";
import { Node } from "../types";

// Track 1st staking bond as default
let paraStakingBond: number | undefined;

export type GenesisNodeKey = [string, string, { [key: string]: string }];

export function getNodeKey(node: Node, useStash = true): GenesisNodeKey {
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
  runtimeConfig.balances.balances.push([sr_account.address, stakingBond]);
  runtimeConfig.parachainStaking.candidates.push([
    sr_account.address,
    stakingBond,
  ]);

  writeChainSpec(specPath, chainSpec);
}

export default {
  getNodeKey,
  clearAuthorities,
  addParaCustom,
};
