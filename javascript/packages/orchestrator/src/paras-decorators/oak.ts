import { Node } from "../types";
import {
  clearAuthorities as _clearAuthorities,
  getRuntimeConfig,
  readAndParseChainSpec,
  writeChainSpec,
} from "../chain-spec";

// track 1st staking as default;
let paraStakingBond: number | undefined;

export type GenesisNodeKey = [string, string, { [key: string]: string }];

export function getNodeKey(
  node: Node,
  useStash: boolean = true,
): GenesisNodeKey {
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

  // clear parachainStaking
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

  // parachainStaking
  if (!runtimeConfig?.parachainStaking) return;

  const { sr_account } = node.accounts;
  const stakingBond = paraStakingBond || 1000000000000;

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
