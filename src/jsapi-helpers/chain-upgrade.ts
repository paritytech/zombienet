import { ApiPromise, Keyring } from "@polkadot/api";
import { withTypeString } from "@polkadot/types";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { readFileSync, promises as fsPromises } from "fs";

import { compress, decompress } from "napi-maybe-compressed-blob";

export async function chainUpgrade(api: ApiPromise, wasmFilePath: string): Promise<void> {
	// The filename of the runtime/PVF we want to upgrade to. Usually a file
	// with `.compact.compressed.wasm` extension.
	console.log(`upgrading chain with file: ${wasmFilePath}`);

	let code = readFileSync(wasmFilePath).toString("hex");
	await performChainUpgrade(api, code);
}

export async function chainDummyUpgrade(api: ApiPromise): Promise<void> {
	const code: any = await api.rpc.state.getStorage(":code");
	const codeHex = code.toString().slice(2)
	const codeBuf = Buffer.from(hexToBytes(codeHex));
	const decompressed = decompress(codeBuf);

	// add dummy
	// echo -n -e "\x00\x07\x05\x64\x75\x6D\x6D\x79\x0A"
	const dummyBuf = [0x00, 0x07, 0x05, 0x64, 0x75, 0x6D, 0x6D, 0x79, 0x0A];
	const withDummyCode = Buffer.concat([decompressed, Buffer.from(dummyBuf)]);

	// compress again
	const compressed = compress(withDummyCode);

	// perform upgrade
	await performChainUpgrade(api, compressed.toString("hex"));
}


async function performChainUpgrade(api: ApiPromise, code: string) {
	await cryptoWaitReady()

	const keyring = new Keyring({ type: "sr25519" });
	const alice = keyring.addFromUri("//Alice");

	await new Promise<void>(async (resolve, reject) => {
		const unsub = await api.tx.sudo
		.sudoUncheckedWeight(api.tx.system.setCodeWithoutChecks(`0x${code}`), 1)
		.signAndSend(alice, (result) => {
			console.log(`Current status is ${result.status}`);
			if (result.status.isInBlock) {
				console.log(
					`Transaction included at blockHash ${result.status.asInBlock}`
				);
			} else if (result.status.isFinalized) {
				console.log(
					`Transaction finalized at blockHash ${result.status.asFinalized}`
				);
				unsub();
				return resolve();
			} else if (result.isError) {
				console.log(`Transaction Error`);
				unsub();
				return reject();
			}
		});
	});
}

/// Internal
function hexToBytes(hex: any) {
    for (var bytes = [], c = 0; c < hex.length; c += 2)
    bytes.push(parseInt(hex.substr(c, 2), 16));
    return bytes;
}