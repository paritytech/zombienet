import { hexAddPrefix, hexToU8a } from "@polkadot/util";
import { keys as libp2pKeys } from "libp2p-crypto";
import PeerId from "peer-id";

export async function generateBootnodeString(
  key: string,
  args: string[],
  ip: string,
  port: number,
  useWs: boolean = true,
): Promise<string> {
  let multiaddress;
  let pair = await libp2pKeys.generateKeyPairFromSeed(
    "Ed25519",
    hexToU8a(hexAddPrefix(key)),
    1024,
  );
  let peerId: PeerId = await PeerId.createFromPrivKey(pair.bytes);

  const listenIndex = args.findIndex((arg) => arg === "--listen-addr");
  if (listenIndex >= 0) {
    let listenAddrParts = args[listenIndex + 1].split("/");
    listenAddrParts[2] = ip;
    listenAddrParts[4] = port.toString();
    multiaddress = `${listenAddrParts.join("/")}/p2p/${peerId.toB58String()}`;
  } else {
    multiaddress = `/ip4/${ip}/tcp/${port}/${
      useWs ? "ws/" : "/"
    }p2p/${peerId.toB58String()}`;
  }

  console.log("multiaddress", multiaddress);
  return multiaddress;
}
