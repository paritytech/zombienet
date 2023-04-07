import { CreateLogTable, decorators } from "@zombienet/utils";
import {
  getRuntimeConfig,
  readAndParseChainSpec,
  writeChainSpec,
} from "../chainSpec";
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
export function clearAuthorities(specPath: string) {
  const chainSpec = readAndParseChainSpec(specPath);
  const runtimeConfig = getRuntimeConfig(chainSpec);

  // clear keys
  if (runtimeConfig?.session) runtimeConfig.session.keys.length = 0;
  // clear aura
  if (runtimeConfig?.aura) runtimeConfig.aura.authorities.length = 0;
  // clear grandpa
  if (runtimeConfig?.grandpa) runtimeConfig.grandpa.authorities.length = 0;

  // clear collatorSelection
  if (runtimeConfig?.collatorSelection)
    runtimeConfig.collatorSelection.invulnerables = [];

  // clear eqSession validators
  if (runtimeConfig?.eqSessionManager)
    runtimeConfig.eqSessionManager = { validators: [] };

  writeChainSpec(specPath, chainSpec);
  let logTable = new CreateLogTable({
    colWidths: [120],
  });
  logTable.pushToPrint([
    [decorators.green("🧹 Starting with a fresh authority set...")],
  ]);
}

export default {
  getNodeKey,
  addAuthority,
  clearAuthorities,
};
