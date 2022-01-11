import {
  DEFAULT_COLLATOR_IMAGE,
  DEFAULT_REMOTE_DIR,
  GENESIS_STATE_FILENAME,
  GENESIS_WASM_FILENAME,
  getUniqueName,
  WAIT_UNTIL_SCRIPT_SUFIX,
} from "./configManager";
import { getClient } from "./providers/client";
import { Providers } from "./providers";
import { Node, Parachain } from "./types";
import fs from "fs";

export async function generateParachainFiles(
  namespace: string,
  tmpDir: string,
  chainName: string,
  parachain: Parachain
): Promise<string> {
  const parachainFilesPath = `${tmpDir}/${parachain.id}`;
  const stateLocalFilePath = `${parachainFilesPath}/${GENESIS_STATE_FILENAME}`;
  const wasmLocalFilePath = `${parachainFilesPath}/${GENESIS_WASM_FILENAME}`;
  const client = getClient();

  fs.mkdirSync(parachainFilesPath);

  // check if we need to create files
  if (parachain.genesisStateGenerator || parachain.genesisWasmGenerator) {
    let commands = [];
    if (parachain.genesisStateGenerator)
      commands.push(parachain.genesisStateGenerator);
    if (parachain.genesisWasmGenerator)
      commands.push(parachain.genesisWasmGenerator);
    commands.push(WAIT_UNTIL_SCRIPT_SUFIX);

    let node: Node = {
      name: getUniqueName("temp-collator"),
      validator: false,
      image: parachain.collator.image || DEFAULT_COLLATOR_IMAGE,
      fullCommand: commands.join(" && "),
      chain: chainName,
      bootnodes: [],
      args: [],
      env: [],
      telemetryUrl: "",
      overrides: [],
    };

    const provider = Providers.get(client.providerName);
    const podDef = await provider.genNodeDef(namespace, node);
    const podName = podDef.metadata.name;

    await client.spawnFromDef(podDef);

    if (parachain.genesisStateGenerator) {
      await client.copyFileFromPod(
        podDef.metadata.name,
        `${DEFAULT_REMOTE_DIR}/${GENESIS_STATE_FILENAME}`,
        stateLocalFilePath
      );
    }

    if (parachain.genesisWasmGenerator) {
      await client.copyFileFromPod(
        podDef.metadata.name,
        `${DEFAULT_REMOTE_DIR}/${GENESIS_WASM_FILENAME}`,
        wasmLocalFilePath
      );
    }

    await client.putLocalMagicFile(podName, podName);
  }

  if (parachain.genesisStatePath) {
    // copy file to temp to use
    fs.copyFileSync(parachain.genesisStatePath, stateLocalFilePath);
  }

  if (parachain.genesisWasmPath) {
    // copy file to temp to use
    fs.copyFileSync(parachain.genesisWasmPath, wasmLocalFilePath);
  }

  // register parachain
  // await network.registerParachain(
  //   parachain.id,
  //   wasmLocalFilePath,
  //   stateLocalFilePath
  // );

  return parachainFilesPath;
}
