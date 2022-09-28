import { Node } from "../types";

// Acala genesis node key type
export type GenesisNodeKey = [string, string, { [key: string]: string }];

export function getNodeKey(
  node: Node,
  useStash: boolean = true,
): GenesisNodeKey {
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
