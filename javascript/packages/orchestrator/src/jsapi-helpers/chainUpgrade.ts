import { ApiPromise, Keyring } from "@polkadot/api";
import { blake2AsHex, cryptoWaitReady } from "@polkadot/util-crypto";
import { promises as fsPromises } from "fs";
import { compress, decompress } from "napi-maybe-compressed-blob";
import { DEFAULT_INDIVIDUAL_TEST_TIMEOUT } from "../constants";
const debug = require("debug")("zombie::js-helpers::chain-upgrade");

export async function chainUpgradeFromUrl(
  api: ApiPromise,
  wasmFileUrl: string,
): Promise<string> {
  // The filename of the runtime/PVF we want to upgrade to. Usually a file
  // with `.compact.compressed.wasm` extension.
  console.log(`upgrading chain with file from url: ${wasmFileUrl}`);

  const fetchResponse = await fetch(wasmFileUrl);
  const file = await fetchResponse.arrayBuffer();

  const buff = Buffer.from(file);
  const hash = blake2AsHex(buff);
  await performChainUpgrade(api, buff.toString("hex"));

  return hash;
}

export async function chainUpgradeFromLocalFile(
  api: ApiPromise,
  filePath: string,
): Promise<string> {
  // The filename of the runtime/PVF we want to upgrade to. Usually a file
  // with `.compact.compressed.wasm` extension.
  console.log(`upgrading chain with file from path: ${filePath}`);

  const data = await fsPromises.readFile(filePath);

  const buff = Buffer.from(data);
  const hash = blake2AsHex(buff);
  await performChainUpgrade(api, buff.toString("hex"));

  return hash;
}

// Add a custom section to the end, re-compress and perform the upgrade of the runtime.
// It's required by the standard that custom sections cannot have any semantic differences
// and can be ignored in the general case.
// The wasm format consists of bunch of sections. Here we just slap a custom section to the end.
export async function chainCustomSectionUpgrade(
  api: ApiPromise,
): Promise<string> {
  const code: any = await api.rpc.state.getStorage(":code");
  const codeHex = code.toString().slice(2);
  const codeBuf = Buffer.from(hexToBytes(codeHex));
  const decompressed = decompress(codeBuf);

  // add a custom section
  // Same as echo -n -e "\x00\x07\x05\x64\x75\x6D\x6D\x79\x0A" >> file.wasm
  const customSection = [0x00, 0x07, 0x05, 0x64, 0x75, 0x6d, 0x6d, 0x79, 0x0a];
  const withCustomSectionCode = Buffer.concat([
    decompressed,
    Buffer.from(customSection),
  ]);

  // compress again
  const compressed = compress(withCustomSectionCode);
  const hash = blake2AsHex(compressed);
  debug(`New compressed hash : ${hash}`);

  await performChainUpgrade(api, compressed.toString("hex"));

  return hash;
}

export async function validateRuntimeCode(
  api: ApiPromise,
  paraId: number,
  hash: string,
  timeout = DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
): Promise<boolean> {
  const validate = async (hash: string) => {
    let done;
    while (!done) {
      const currentHash = await api.query.paras.currentCodeHash(paraId);
      console.log(`parachain ${paraId} current code hash : ${currentHash}`);
      if (hash === currentHash.toString()) break;
      // wait 2 secs between checks
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return true;
  };
  const resp: any = await Promise.race([
    validate(hash),
    new Promise((resolve) =>
      setTimeout(() => {
        const err = new Error(
          `Timeout(${timeout}), "validating the hash of the runtime upgrade`,
        );
        return resolve(err);
      }, timeout * 1000),
    ),
  ]);
  if (resp instanceof Error) throw resp;

  return resp;
}

async function performChainUpgrade(api: ApiPromise, code: string) {
  await cryptoWaitReady();

  const keyring = new Keyring({ type: "sr25519" });
  const alice = keyring.addFromUri("//Alice");

  await new Promise<void>(async (resolve, reject) => {
    const unsub = await api.tx.sudo
      .sudoUncheckedWeight(api.tx.system.setCodeWithoutChecks(`0x${code}`), {
        refTime: 1,
      })
      .signAndSend(alice, (result) => {
        console.log(`Current status is ${result.status}`);
        if (result.status.isInBlock) {
          console.log(
            `Transaction included at blockHash ${result.status.asInBlock}`,
          );
        } else if (result.status.isFinalized) {
          console.log(
            `Transaction finalized at blockHash ${result.status.asFinalized}`,
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
  const bytes = [];
  for (let c = 0; c < hex.length; c += 2)
    bytes.push(parseInt(hex.substr(c, 2), 16));
  return bytes;
}
