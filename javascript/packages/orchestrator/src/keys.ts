import { Keyring } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import {
  cryptoWaitReady,
  mnemonicGenerate,
  mnemonicToMiniSecret,
} from "@polkadot/util-crypto";
import { makeDir } from "@zombienet/utils";
import fs from "fs";
import { Node } from "./types";

function nameCase(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export async function generateKeyFromSeed(seed: string): Promise<any> {
  await cryptoWaitReady();

  const sr_keyring = new Keyring({ type: "sr25519" });
  return sr_keyring.createFromUri(`//${seed}`);
}

export async function generateKeyForNode(nodeName?: string): Promise<any> {
  await cryptoWaitReady();

  const mnemonic = mnemonicGenerate();
  const seed = nodeName
    ? `//${nameCase(nodeName)}`
    : u8aToHex(mnemonicToMiniSecret(mnemonic));

  const sr_keyring = new Keyring({ type: "sr25519" });
  const sr_account = sr_keyring.createFromUri(`${seed}`);
  const sr_stash = sr_keyring.createFromUri(`${seed}//stash`);

  const ed_keyring = new Keyring({ type: "ed25519" });
  const ed_account = ed_keyring.createFromUri(`${seed}`);

  const ec_keyring = new Keyring({ type: "ecdsa" });
  const ec_account = ec_keyring.createFromUri(`${seed}`);

  // return the needed info
  return {
    seed,
    mnemonic,
    sr_account: {
      address: sr_account.address,
      publicKey: u8aToHex(sr_account.publicKey),
    },
    sr_stash: {
      address: sr_stash.address,
      publicKey: u8aToHex(sr_stash.publicKey),
    },
    ed_account: {
      address: ed_account.address,
      publicKey: u8aToHex(ed_account.publicKey),
    },
    ec_account: {
      publicKey: u8aToHex(ec_account.publicKey),
    },
  };
}

export async function generateKeystoreFiles(
  node: Node,
  path: string,
  isStatemint: boolean = false,
): Promise<string[]> {
  const keystoreDir = `${path}/keystore`;
  await makeDir(keystoreDir);

  const paths: string[] = [];
  const keysHash = {
    aura: isStatemint
      ? node.accounts.ed_account.publicKey
      : node.accounts.sr_account.publicKey,
    babe: node.accounts.sr_account.publicKey,
    imon: node.accounts.sr_account.publicKey,
    gran: node.accounts.ed_account.publicKey,
    audi: node.accounts.sr_account.publicKey,
    asgn: node.accounts.sr_account.publicKey,
    para: node.accounts.sr_account.publicKey,
    beef: node.accounts.ec_account.publicKey,
    nmbs: node.accounts.sr_account.publicKey, // Nimbus
    rand: node.accounts.sr_account.publicKey, // Randomness (Moonbeam)
    rate: node.accounts.ed_account.publicKey, // Equilibrium rate module
  };

  for (const [k, v] of Object.entries(keysHash)) {
    const filename = Buffer.from(k).toString("hex") + v.replace(/^0x/, "");
    const keystoreFilePath = `${keystoreDir}/${filename}`;
    paths.push(keystoreFilePath);
    await fs.promises.writeFile(keystoreFilePath, `"${node.accounts.seed}"`);
  }

  return paths;
}
