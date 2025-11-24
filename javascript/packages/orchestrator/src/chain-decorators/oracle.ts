import { Node } from "../sharedTypes";

export type GenesisNodeKey = [string, string, { [key: string]: string }];

export function getNodeKey(node: Node): GenesisNodeKey {
  const { sr_account } = node.accounts;

  const address = sr_account.address;

  const key: GenesisNodeKey = [
    address,
    address,
    {
      aura: address,
      oracle: address,
    },
  ];

  return key;
}

export default {
  getNodeKey,
};

