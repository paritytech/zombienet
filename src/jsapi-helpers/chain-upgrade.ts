import { ApiPromise, Keyring } from "@polkadot/api";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { readFileSync } from "fs";

export async function chainUpgrade(api: ApiPromise, wasmFilePath: string): Promise<void> {
  // The filename of the runtime/PVF we want to upgrade to. Usually a file
  // with `.compact.compressed.wasm` extension.
	console.log(`upgrading the chain with the ${wasmFilePath}`);

	let code = readFileSync(wasmFilePath).toString('hex');

	await cryptoWaitReady()

	const keyring = new Keyring({ type: "sr25519" });
	const alice = keyring.addFromUri("//Alice");

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
			} else if (result.isError) {
				console.log(`Transaction Error`);
			}
		});
}