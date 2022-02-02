import { Keyring } from "@polkadot/api";
import { cryptoWaitReady } from "@polkadot/util-crypto";

function nameCase(string: string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

export async function generateKeyForNode(seed: string, name: string): Promise<any> {
    await cryptoWaitReady();

    const sr_keyring = new Keyring({ type: "sr25519" });
    const sr_account = sr_keyring.createFromUri(`${seed}//${nameCase(name)}`);
    const sr_stash = sr_keyring.createFromUri(`${seed}//${nameCase(name)}//stash`);

    const ed_keyring = new Keyring({ type: "ed25519" });
    const ed_account = ed_keyring.createFromUri(`${seed}//${nameCase(name)}`);

    const ec_keyring = new Keyring({ type: "ecdsa" });
    const ec_account = ec_keyring.createFromUri(`${seed}//${nameCase(name)}`);

    // return the needed info
    return {
        sr_account: {
            address: sr_account.address
        },
        sr_stash: {
            address: sr_stash.address
        },
        ed_account: {
            address: ed_account.address
        },
        ec_account: {
            publicKey: ec_account.publicKey
        }
    }
}
