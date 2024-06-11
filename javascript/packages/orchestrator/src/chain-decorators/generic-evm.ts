import { Keyring } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { CreateLogTable, decorators } from "@zombienet/utils";
import {
  GenesisNodeKey,
  getRuntimeConfig,
  readAndParseChainSpec,
  writeChainSpec,
} from "../chainSpec";
import { generateKeyForNode as _generateKeyForNode } from "../keys";
import { Node } from "../sharedTypes";

async function generateKeyForNode(nodeName?: string): Promise<any> {
  const keys = await _generateKeyForNode(nodeName);

  await cryptoWaitReady();

  const eth_keyring = new Keyring({ type: "ethereum" });
  const eth_account = eth_keyring.createFromUri(
    `${keys.mnemonic}/m/44'/60'/0'/0/0`,
  );

  keys.eth_account = {
    address: eth_account.address,
    publicKey: u8aToHex(eth_account.publicKey),
  };

  return keys;
}

export function getNodeKey(node: Node): GenesisNodeKey {
  try {
    const { sr_account, eth_account } = node.accounts;

    const key: GenesisNodeKey = [
      eth_account.address,
      eth_account.address,
      {
        aura: sr_account.address,
      },
    ];

    return key;
  } catch (err) {
    console.error(
      `\n${decorators.red(`Fail to generate key for node: ${node}`)}`,
    );
    throw err;
  }
}

export async function addCollatorSelection(specPath: string, node: Node) {
  try {
    const chainSpec = readAndParseChainSpec(specPath);
    const runtimeConfig = getRuntimeConfig(chainSpec);
    if (
      !runtimeConfig?.collatorSelection?.invulnerables &&
      !runtimeConfig?.collatorStaking?.invulnerables
    )
      return;

    const { eth_account } = node.accounts;

    if (runtimeConfig.collatorSelection)
      runtimeConfig.collatorSelection.invulnerables.push(eth_account.address);
    if (runtimeConfig.collatorStaking)
      runtimeConfig.collatorStaking.invulnerables.push(eth_account.address);

    new CreateLogTable({
      colWidths: [30, 20, 70],
    }).pushToPrint([
      [
        decorators.cyan("👤 Added CollatorSelection "),
        decorators.green(node.name),
        decorators.magenta(eth_account.address),
      ],
    ]);

    writeChainSpec(specPath, chainSpec);
  } catch (err) {
    console.error(`\n${decorators.red(`Fail to add collator: ${node}`)}`);
    throw err;
  }
}

export default {
  getNodeKey,
  generateKeyForNode,
  addCollatorSelection,
};
