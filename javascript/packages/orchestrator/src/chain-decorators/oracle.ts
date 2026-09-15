import { Node } from "../sharedTypes";

export type GenesisNodeKey = [string, string, { [key: string]: string }];

export function getNodeKey(node: Node): GenesisNodeKey {
  const {
    sr_account,
    aura: aura_account,
    orcl: oracle_account,
  } = node.accounts;

  const address = sr_account.address;

  const key: GenesisNodeKey = [
    address,
    address,
    {
      aura: aura_account ? aura_account.address : sr_account.address,
      oracle: oracle_account ? oracle_account.address : sr_account.address,
    },
  ];

  return key;
}

export default {
  getNodeKey,
};
