import { Node } from "../types";

// Efinity genesis node key type
export type GenesisNodeKey = [string, string, { [key: string]: string }];

export function getNodeKey(
  node: Node,
  useStash: boolean = true,
): GenesisNodeKey {
  const { sr_stash, sr_account, ed_account, ec_account } = node.accounts;

  const address = useStash ? sr_stash.address : sr_account.address;

  const key: GenesisNodeKey = [
    address,
    address,
    {
      aura: address,
      pools: address,
    },
  ];

  return key;
}

export default {
  getNodeKey,
};
