import { Node } from "../types";

// Bifrost genesis node key type
export type GenesisNodeKey = [string, string, { [key: string]: string }];

export function getNodeKey(node: Node, useStash = true): GenesisNodeKey {
  const { sr_stash, sr_account } = node.accounts;

  const address = useStash ? sr_stash.address : sr_account.address;

  const key: GenesisNodeKey = [
    address,
    address,
    {
      aura: address,
    },
  ];

  return key;
}

export default {
  getNodeKey,
};
