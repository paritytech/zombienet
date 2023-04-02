import { hexAddPrefix, hexToU8a } from "@polkadot/util";
import { keys as libp2pKeys } from "libp2p-crypto";
import PeerId from "peer-id";
import { NodeMultiAddress } from "./types";

export async function generateNodeMultiAddress(
  key: string,
  args: string[],
  ip: string,
  port: number,
  useWs: boolean = true,
  certhash?: string,
): Promise<NodeMultiAddress> {
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
    if (certhash) listenAddrParts.push("certhash", certhash);
    multiaddress = `${listenAddrParts.join("/")}/p2p/${peerId.toB58String()}`;
  } else {
    multiaddress = `/ip4/${ip}/tcp/${port}/${
      useWs ? "ws/" : "/"
    }p2p/${peerId.toB58String()}`;
  }

  return multiaddress;
}
