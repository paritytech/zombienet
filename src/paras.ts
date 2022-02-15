import {
  DEFAULT_COLLATOR_IMAGE,
  GENESIS_STATE_FILENAME,
  GENESIS_WASM_FILENAME,
  WAIT_UNTIL_SCRIPT_SUFIX,
} from "./constants";
import { getUniqueName } from "./configManager";
import { getClient } from "./providers/client";
import { Providers } from "./providers";
import { Node, Parachain } from "./types";
import fs from "fs";
import { getChainSpecRaw, setupChainSpec } from "./providers/native/chain-spec";
const debug = require("debug")("zombie::paras");

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

  if(parachain.collator.command === "polkadot-collator") {
    // need to create the parachain spec
    const chainSpecFullPathPlain = `${tmpDir}/${chainName}-${parachain.id}-plain.json`;
    const chainSpecFullPath = `${tmpDir}/${chainName}-${parachain.id}.json`;
    debug("creating chain spec plain");
    // create or copy chain spec
    await setupChainSpec(
      namespace,
      {relaychain: { chainSpecCommand: `${parachain.collator.command} build-spec --disable-default-bootnode`}},
      chainName,
      chainSpecFullPathPlain
    );

    const plainData = JSON.parse(fs.readFileSync(chainSpecFullPathPlain).toString());
    plainData.para_id = parachain.id;
    plainData.genesis.runtime.parachainInfo.parachainId = parachain.id;
    const data = JSON.stringify(plainData, null, 2);
    fs.writeFileSync(chainSpecFullPathPlain, data);

    debug("creating chain spec raw");
    // generate the raw chain spec
    await getChainSpecRaw(
      namespace,
      parachain.collator.image,
      `${chainName}-${parachain.id}`,
      parachain.collator.command,
      chainSpecFullPath
    );
  }

  // check if we need to create files
  if (parachain.genesisStateGenerator || parachain.genesisWasmGenerator) {
    let commands = [];
    if (parachain.genesisStateGenerator)
      commands.push(
        parachain.genesisStateGenerator.replace(
          "{{CLIENT_REMOTE_DIR}}",
          client.remoteDir as string
        )
      );
    if (parachain.genesisWasmGenerator)
      commands.push(
        parachain.genesisWasmGenerator.replace(
          "{{CLIENT_REMOTE_DIR}}",
          client.remoteDir as string
        )
      );

    // Native provider doesn't need to wait
    if (client.providerName !== "native")
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
      zombieRole: "temp",
    };

    const provider = Providers.get(client.providerName);
    const podDef = await provider.genNodeDef(namespace, node);
    const podName = podDef.metadata.name;

    await client.spawnFromDef(podDef);

    if (parachain.genesisStateGenerator) {
      await client.copyFileFromPod(
        podDef.metadata.name,
        `${client.remoteDir}/${GENESIS_STATE_FILENAME}`,
        stateLocalFilePath
      );
    }

    if (parachain.genesisWasmGenerator) {
      await client.copyFileFromPod(
        podDef.metadata.name,
        `${client.remoteDir}/${GENESIS_WASM_FILENAME}`,
        wasmLocalFilePath
      );
    }

    await client.putLocalMagicFile(podName, podName);
  }

  if (parachain.genesisStatePath) {
    fs.copyFileSync(parachain.genesisStatePath, stateLocalFilePath);
  }

  if (parachain.genesisWasmPath) {
    fs.copyFileSync(parachain.genesisWasmPath, wasmLocalFilePath);
  }

  return parachainFilesPath;
}
