import { keys as libp2pKeys } from "libp2p-crypto";
import { hexAddPrefix, hexToU8a } from "@polkadot/util";
import PeerId from "peer-id";

export async function generateBootnodeString(
    key: string,
    ip: string,
    port: number,
): Promise<string> {

		let pair = await libp2pKeys.generateKeyPairFromSeed(
			"Ed25519",
			hexToU8a(hexAddPrefix(key)),
			1024
		);
		let peerId: PeerId = await PeerId.createFromPrivKey(pair.bytes);
		const multiaddress = `/ip4/${ip}/tcp/${port}/p2p/${peerId.toB58String()}`
        return multiaddress;
}