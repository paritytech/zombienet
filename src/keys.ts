import fs from "fs";
import { Keyring } from "@polkadot/api";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";
import { mnemonicGenerate, mnemonicToMiniSecret } from "@polkadot/util-crypto";
import { Node } from "./types";

function nameCase(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

const KNOWN_MOONBEAM_KEYS: { [name: string]: string } = {
  alith: "0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133",
  baltathar:
    "0x8075991ce870b93a8870eca0c0f91913d12f47948ca0fd25b49c6fa7cdbeee8b",
  charleth:
    "0x0b6e18cafb6ed99687ec547bd28139cafdd2bffe70e6b688025de6b445aa5c5b",
  dorothy: "0x39539ab1876910bbf3a223d84a29e28f1cb4e2e456503e7e91ed39b2e7223d68",
  ethan: "0x7dce9bc8babb68fec1409be38c8e1a52650206a7ed90ff956ae8a6d15eeaaef4",
  faith: "0xb9d2ea9a615f3165812e8d44de0d24da9bbd164b65c4f0573e1ce2c8dbd9c8df",
  goliath: "0x96b8a38e12e1a31dee1eab2fffdf9d9990045f5b37e44d8cc27766ef294acf18",
  heath: "0x0d6dcaaef49272a5411896be8ad16c01c35d6f8c18873387b71fbc734759b0ab",
  ida: "0x4c42532034540267bf568198ccec4cb822a025da542861fcb146a5fab6433ff8",
  judith: "0x94c49300a58d576011096bcb006aa06f5a91b34b4383891e8029c21dc39fbb8b",
};

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

  const eth_keyring = new Keyring({ type: "ethereum" });
  const eth_account = eth_keyring.createFromUri(
    nodeName && nodeName.toLocaleLowerCase() in KNOWN_MOONBEAM_KEYS
      ? KNOWN_MOONBEAM_KEYS[nodeName.toLocaleLowerCase()]
      : `${mnemonic}/m/44'/60'/0'/0/0`,
  );

  // return the needed info
  return {
    seed,
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
    eth_account: {
      address: eth_account.address,
      publicKey: u8aToHex(eth_account.publicKey),
    },
  };
}

export async function generateKeystoreFiles(
  node: Node,
  path: string,
  isStatemint: boolean = false,
): Promise<string[]> {
  const keystoreDir = `${path}/keystore`;
  await fs.promises.mkdir(keystoreDir);

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
  };

  for (const [k, v] of Object.entries(keysHash)) {
    const filename = Buffer.from(k).toString("hex") + v.replace(/^0x/, "");
    const keystoreFilePath = `${keystoreDir}/${filename}`;
    paths.push(keystoreFilePath);
    await fs.promises.writeFile(keystoreFilePath, `"${node.accounts.seed}"`);
  }

  return paths;
}
