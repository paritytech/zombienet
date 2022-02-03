import fs from "fs";
import { Keyring } from "@polkadot/api";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";
import { mnemonicGenerate, mnemonicToMiniSecret} from "@polkadot/util-crypto";
import { Node } from "./types";

export async function generateKeyForNode(): Promise<any> {
    await cryptoWaitReady();

    const mnemonic = mnemonicGenerate();
    const seed = u8aToHex(mnemonicToMiniSecret(mnemonic));

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
        sr_account: {
            address: sr_account.address,
            publicKey: u8aToHex(sr_account.publicKey)
        },
        sr_stash: {
            address: sr_stash.address,
            publicKey: u8aToHex(sr_stash.publicKey)
        },
        ed_account: {
            address: ed_account.address,
            publicKey: u8aToHex(ed_account.publicKey)
        },
        ec_account: {
            publicKey: ec_account.publicKey
        }
    }
}

export async function generateKeystoreFiles(node: Node, path: string): Promise<string[]> {
    const paths: string[] = [];
    const keysHash = {
        aura: node.accounts.sr_account.publicKey,
        babe: node.accounts.sr_account.publicKey,
        imon: node.accounts.sr_account.publicKey,
        gran: node.accounts.ed_account.publicKey,
        audi: node.accounts.sr_account.publicKey,
        asgn: node.accounts.sr_account.publicKey,
        para: node.accounts.sr_account.publicKey
    }

    for( const [k,v] of Object.entries(keysHash)) {
        const filename = Buffer.from(k).toString('hex') + v.replace(/^0x/, "");
        const keystorePath = `${path}/${filename}`;
        paths.push(keystorePath);
        await fs.promises.writeFile(keystorePath, `"${node.accounts.seed}"`);
    }

    return paths;
}