import { Node } from "../sharedTypes";

// Aventus genesis node key type
export type GenesisNodeKey = [string, string, { [key: string]: string }];

export function getNodeKey(node: Node, useStash = true): GenesisNodeKey {
  const { sr_stash, sr_account, ed_account } = node.accounts;

  const address = useStash ? sr_stash.address : sr_account.address;

  const key: GenesisNodeKey = [
    address,
    address,
    {
      aura: sr_account.address,
      grandpa: ed_account.address,
      authority_discovery: sr_account.address,
      im_online: sr_account.address,
      avn: sr_account.address,
    },
  ];

  return key;
}

export default {
  getNodeKey,
};
