import { GenesisNodeKey, getNodeKey as _getNodeKey } from "../chain-spec";
import { Node } from "../types";

export function getNodeKey(
  node: Node,
  useStash: boolean = true,
): GenesisNodeKey {
  const { ed_account } = node.accounts;

  let key = _getNodeKey(node, useStash);
  key[2].aura = ed_account.address;

  return key;
}

export default {
  getNodeKey,
};
