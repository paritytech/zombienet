import { Keyring } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import {
  cryptoWaitReady,
  mnemonicGenerate,
  mnemonicToMiniSecret,
} from "@polkadot/util-crypto";
import { makeDir } from "@zombienet/utils";
import fs from "fs";
import { Node } from "./sharedTypes";

const debug = require("debug")("zombie::orchestrator::keys");

function nameCase(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export async function generateKeyFromSeed(seed: string): Promise<any> {
  await cryptoWaitReady();

  const sr_keyring = new Keyring({ type: "sr25519" });
  return sr_keyring.createFromUri(`//${seed}`);
}

export async function generateKeyForNode(
  nodeName?: string,
  keyMap?: KeyTypesMap,
): Promise<any> {
  await cryptoWaitReady();

  const mnemonic = mnemonicGenerate();
  const seed = nodeName
    ? `//${nameCase(nodeName)}`
    : u8aToHex(mnemonicToMiniSecret(mnemonic));

  // Create keyring for each schema
  const sr_keyring = new Keyring({ type: "sr25519" });
  const ed_keyring = new Keyring({ type: "ed25519" });
  const ec_keyring = new Keyring({ type: "ecdsa" });

  const sr_account = sr_keyring.createFromUri(`${seed}`);
  const sr_stash = sr_keyring.createFromUri(`${seed}//stash`);
  const ed_account = ed_keyring.createFromUri(`${seed}`);
  const ec_account = ec_keyring.createFromUri(`${seed}`);

  // create the base info
  const keysForNode: any = {
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

  // and customize
  if (keyMap) {
    for (const [key, schema] of Object.entries(keyMap)) {
      const key_seed = `${seed}//${key}`;
      const acc =
        schema == "ec"
          ? ec_keyring.createFromUri(`${key_seed}`)
          : schema == "ed"
            ? ed_keyring.createFromUri(`${key_seed}`)
            : sr_keyring.createFromUri(`${key_seed}`);

      keysForNode[key] = {
        address: acc.address,
        publicKey: u8aToHex(acc.publicKey),
        seed: key_seed,
        schema,
      };
    }
  }

  debug("keysForNode", keysForNode);
  return keysForNode;
}

export interface DefaultKeystoreKeyTypes {
  [key: string]: string;
}

// map short name with key schema (e.g "aura" -> "ed")
export interface KeyTypesMap {
  [key: string]: string;
}

export function generateKeyTypeMap(
  keystoreKeyTypes: string[] | undefined,
  isAssetHubPolkadot = false,
): KeyTypesMap {
  const keyMap: KeyTypesMap = {};

  // 2 ways keys can be defined:
  keystoreKeyTypes?.forEach((key_spec) => {
    // short: by only 4 letter key type with defaulted scheme e.g. "audi", default schema is "sr"
    if (key_spec.length === 4) {
      keyMap[key_spec] = "sr";
    }

    // long: 4 letter key type with scheme separated by underscore e.g. "audi_sr"
    const [key_type, key_scheme] = key_spec.split("_");
    if (key_type.length === 4) {
      if (key_scheme === "ed") {
        keyMap[key_type] = "ed";
      } else if (key_scheme === "ec") {
        keyMap[key_type] = "ec";
      } else if (key_scheme === "sr") {
        keyMap[key_type] = "sr";
      }
    }
  });

  // ensure aura has the correct key
  keyMap["aura"] = isAssetHubPolkadot ? "ed" : "sr";

  return keyMap;
}
export async function generateKeystoreFiles(
  node: Node,
  path: string,
  keyMap: KeyTypesMap,
  // isAssetHubPolkadot = false,
): Promise<string[]> {
  const keystoreDir = `${path}/keystore`;
  await makeDir(keystoreDir);

  const paths: string[] = [];

  for (const [k, v] of Object.entries(keyMap)) {
    // check if we have the account to use by  key or by schema
    const acc = node.accounts[k]
      ? node.accounts[k]
      : node.accounts[`${v}_account`];
    const filename =
      Buffer.from(k).toString("hex") + acc.publicKey.replace(/^0x/, "");
    const keystoreFilePath = `${keystoreDir}/${filename}`;
    paths.push(keystoreFilePath);
    await fs.promises.writeFile(keystoreFilePath, `"${acc.seed}"`);
  }

  return paths;
}
