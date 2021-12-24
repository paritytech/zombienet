import { debug } from "console";
import {
  DEFAULT_COLLATOR_IMAGE,
  GENESIS_STATE_FILENAME,
  GENESIS_WASM_FILENAME,
  getUniqueName,
  TRANSFER_CONTAINER_NAME,
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
  // const localMagicFilepath = `${tmpDir}/finished.txt`;
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
    const podDef = await Providers.get(client.providerName).genPodDef(namespace, node);
    const podName = podDef.metadata.name;

    debug(
      `launching ${podName} pod with image ${podDef.spec.containers[0].image}`
    );
    debug(`command: ${podDef.spec.containers[0].command.join(" ")}`);

    await client.createResource(podDef, true, false);
    await client.wait_transfer_container(podName);

    // await client.copyFileToPod(
    //   podDef.metadata.name,
    //   localMagicFilepath,
    //   FINISH_MAGIC_FILE,
    //   TRANSFER_CONTAINER_NAME
    // );
    await client.putLocalMagicFile(podName,TRANSFER_CONTAINER_NAME);

    await client.wait_pod_ready(podName);

    if (parachain.genesisStateGenerator) {
      await client.copyFileFromPod(
        podDef.metadata.name,
        `/cfg/${GENESIS_STATE_FILENAME}`,
        stateLocalFilePath
      );
    }

    if (parachain.genesisWasmGenerator) {
      await client.copyFileFromPod(
        podDef.metadata.name,
        `/cfg/${GENESIS_WASM_FILENAME}`,
        wasmLocalFilePath
      );
    }

    // // put file to terminate pod
    // await client.copyFileToPod(
    //   podDef.metadata.name,
    //   localMagicFilepath,
    //   FINISH_MAGIC_FILE
    // );
    await client.putLocalMagicFile(podName, podName);
  }

  if (parachain.genesisStatePath) {
    // copy file to temp to use
    fs.copyFileSync(
        parachain.genesisStatePath,
        stateLocalFilePath );
  }
  // else throw new Error("Invalid state file path");

  if (parachain.genesisWasmPath) {
    // copy file to temp to use
    fs.copyFileSync(
        parachain.genesisWasmPath,
        wasmLocalFilePath );
  }
  //else throw new Error("Invalid wasm file path");

  // register parachain
  // await network.registerParachain(
  //   parachain.id,
  //   wasmLocalFilePath,
  //   stateLocalFilePath
  // );

  return parachainFilesPath;
}
