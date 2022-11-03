import { CreateLogTable, decorators } from "@zombienet/utils";
import {
  getRuntimeConfig,
  readAndParseChainSpec,
  writeChainSpec,
} from "../chain-spec";
import { Node } from "../types";

// Acala genesis node key type
export type GenesisNodeKey = [string, string, { [key: string]: string }];

export async function addAuthority(
  specPath: string,
  node: Node,
  key: GenesisNodeKey,
) {
  const chainSpec = readAndParseChainSpec(specPath);

  const { sr_stash } = node.accounts;

  let config = getRuntimeConfig(chainSpec);

  let keys = config.session?.keys;
  if (!keys) {
    config.session = { keys: [] };
  } else {
    keys.push(key);
  }

  let eqKeys = config.eqSessionManager?.validators;
  if (!eqKeys) {
    config.eqSessionManager = { validators: [key[0]] };
  } else {
    eqKeys.push(key[0]);
  }

  new CreateLogTable({
    colWidths: [30, 20, 70],
  }).pushToPrint([
    [
      decorators.cyan("👤 Added Genesis Authority"),
      decorators.green(node.name),
      decorators.magenta(sr_stash.address),
    ],
  ]);

  writeChainSpec(specPath, chainSpec);
}

export function getNodeKey(
  node: Node,
  useStash: boolean = true,
): GenesisNodeKey {
  const { sr_stash, sr_account, ed_account } = node.accounts;

  const address = useStash ? sr_stash.address : sr_account.address;

  const key: GenesisNodeKey = [
    address,
    address,
    {
      aura: sr_account.address,
      eq_rate: ed_account.address,
    },
  ];

  return key;
}

export default {
  getNodeKey,
  addAuthority,
};
