import { decorators, getRandomPort } from "@zombienet/utils";
import fs from "fs";
import chainSpecFns, { isRawSpec } from "./chain-spec";
import { getUniqueName } from "./configGenerator";
import {
  DEFAULT_COLLATOR_IMAGE,
  GENESIS_STATE_FILENAME,
  GENESIS_WASM_FILENAME,
  WAIT_UNTIL_SCRIPT_SUFIX,
} from "./constants";
import { decorate } from "./paras-decorators";
import { Providers } from "./providers";
import { getClient } from "./providers/client";
import { fileMap, Node, Parachain } from "./types";

const debug = require("debug")("zombie::paras");

export async function generateParachainFiles(
  namespace: string,
  tmpDir: string,
  parachainFilesPath: string,
  chainName: string,
  parachain: Parachain,
): Promise<void> {
  let [
    addAuraAuthority,
    addAuthority,
    changeGenesisConfig,
    clearAuthorities,
    readAndParseChainSpec,
    specHaveSessionsKeys,
    getNodeKey,
    addParaCustom,
    addCollatorSelection,
    writeChainSpec,
  ] = decorate(parachain.para, [
    chainSpecFns.addAuraAuthority,
    chainSpecFns.addAuthority,
    chainSpecFns.changeGenesisConfig,
    chainSpecFns.clearAuthorities,
    chainSpecFns.readAndParseChainSpec,
    chainSpecFns.specHaveSessionsKeys,
    chainSpecFns.getNodeKey,
    chainSpecFns.addParaCustom,
    chainSpecFns.addCollatorSelection,
    chainSpecFns.writeChainSpec,
  ]);

  const stateLocalFilePath = `${parachainFilesPath}/${GENESIS_STATE_FILENAME}`;
  const wasmLocalFilePath = `${parachainFilesPath}/${GENESIS_WASM_FILENAME}`;
  const client = getClient();

  const { setupChainSpec, getChainSpecRaw } = Providers.get(
    client.providerName,
  );

  let chainSpecFullPath;
  const chainSpecFileName = `${
    parachain.chain ? parachain.chain + "-" : ""
  }${parachain.name}-${chainName}.json`;

  const chainSpecFullPathPlain = `${tmpDir}/${
    parachain.chain ? parachain.chain + "-" : ""
  }${parachain.name}-${chainName}-plain.json`;

  if (parachain.cumulusBased) {
    // need to create the parachain spec parachain file name is [para chain-]<para name>-<relay chain>
    const relayChainSpecFullPathPlain = `${tmpDir}/${chainName}-plain.json`;

    // Check if the chain-spec file is provided.
    if (parachain.chainSpecPath) {
      await fs.promises.copyFile(
        parachain.chainSpecPath,
        chainSpecFullPathPlain,
      );
    } else {
      debug("creating chain spec plain");
      // create or copy chain spec
      await setupChainSpec(
        namespace,
        {
          chainSpecPath: parachain.chainSpecPath,
          chainSpecCommand: `${parachain.collators[0].command} build-spec ${
            parachain.chain ? "--chain " + parachain.chain : ""
          } --disable-default-bootnode`,
          defaultImage: parachain.collators[0].image,
        },
        chainName,
        chainSpecFullPathPlain,
      );
    }

    chainSpecFullPath = `${tmpDir}/${chainSpecFileName}`;
    if (!(await isRawSpec(chainSpecFullPathPlain))) {
      // fields
      const plainData = readAndParseChainSpec(chainSpecFullPathPlain);
      const relayChainSpec = readAndParseChainSpec(relayChainSpecFullPathPlain);
      if (plainData.para_id) plainData.para_id = parachain.id;
      if (plainData.paraId) plainData.paraId = parachain.id;
      if (plainData.relay_chain) plainData.relay_chain = relayChainSpec.id;
      if (plainData.genesis.runtime?.parachainInfo?.parachainId)
        plainData.genesis.runtime.parachainInfo.parachainId = parachain.id;

      writeChainSpec(chainSpecFullPathPlain, plainData);

      // clear auths
      await clearAuthorities(chainSpecFullPathPlain);

      // Chain spec customization logic
      const addToSession = async (node: Node) => {
        const key = getNodeKey(node, false);
        await addAuthority(chainSpecFullPathPlain, node, key);
      };

      const addToAura = async (node: Node) => {
        await addAuraAuthority(
          chainSpecFullPathPlain,
          node.name,
          node.accounts!,
        );
      };

      const addAuthFn = specHaveSessionsKeys(plainData)
        ? addToSession
        : addToAura;

      for (const node of parachain.collators) {
        if (node.validator) {
          await addAuthFn(node);
          await addCollatorSelection(chainSpecFullPathPlain, node);
          await addParaCustom(chainSpecFullPathPlain, node);
        }
      }

      if (parachain.genesis)
        await changeGenesisConfig(chainSpecFullPathPlain, parachain.genesis);

      debug("creating chain spec raw");
      // ensure needed file
      if (parachain.chain)
        fs.copyFileSync(
          chainSpecFullPathPlain,
          `${tmpDir}/${parachain.chain}-${parachain.name}-plain.json`,
        );
      // generate the raw chain spec
      await getChainSpecRaw(
        namespace,
        parachain.collators[0].image,
        `${parachain.chain ? parachain.chain + "-" : ""}${
          parachain.name
        }-${chainName}`,
        parachain.collators[0].command!,
        chainSpecFullPath,
      );
    } else {
      console.log(
        `\n\t\t 🚧 ${decorators.yellow(
          `Chain Spec for paraId ${parachain.id} was set to a file in raw format, can't customize.`,
        )} 🚧`,
      );
      await fs.promises.copyFile(chainSpecFullPathPlain, chainSpecFullPath);
    }

    try {
      // ensure the correct para_id
      const paraSpecRaw = readAndParseChainSpec(chainSpecFullPath);
      if (paraSpecRaw.para_id) paraSpecRaw.para_id = parachain.id;
      if (paraSpecRaw.paraId) paraSpecRaw.paraId = parachain.id;
      writeChainSpec(chainSpecFullPath, paraSpecRaw);
    } catch (e: any) {
      if (e.code !== "ERR_FS_FILE_TOO_LARGE") throw e;

      // can't customize para_id
      console.log(
        `\n\t\t 🚧 ${decorators.yellow(
          `Chain Spec file ${chainSpecFullPath} is TOO LARGE to customize (more than 2G).`,
        )} 🚧`,
      );
    }

    // add spec file to copy to all collators.
    parachain.specPath = chainSpecFullPath;
  }

  // check if we need to create files
  if (parachain.genesisStateGenerator || parachain.genesisWasmGenerator) {
    const filesToCopyToNodes: fileMap[] = [];
    if (parachain.cumulusBased && chainSpecFullPath)
      filesToCopyToNodes.push({
        localFilePath: chainSpecFullPath,
        remoteFilePath: `${client.remoteDir}/${chainSpecFileName}`,
      });

    let commands = [];
    if (parachain.genesisStateGenerator) {
      let genesisStateGenerator = parachain.genesisStateGenerator.replace(
        "{{CLIENT_REMOTE_DIR}}",
        client.remoteDir as string,
      );
      // cumulus
      if (parachain.cumulusBased) {
        const chainSpecPathInNode =
          client.providerName === "native"
            ? chainSpecFullPath
            : `${client.remoteDir}/${chainSpecFileName}`;

        genesisStateGenerator = genesisStateGenerator.replace(
          " > ",
          ` --chain ${chainSpecPathInNode} > `,
        );
      }
      commands.push(genesisStateGenerator);
    }
    if (parachain.genesisWasmGenerator) {
      let genesisWasmGenerator = parachain.genesisWasmGenerator.replace(
        "{{CLIENT_REMOTE_DIR}}",
        client.remoteDir as string,
      );
      // cumulus
      if (parachain.collators[0].zombieRole === "cumulus-collator") {
        const chainSpecPathInNode =
          client.providerName === "native"
            ? chainSpecFullPath
            : `${client.remoteDir}/${chainSpecFileName}`;

        genesisWasmGenerator = genesisWasmGenerator.replace(
          " > ",
          ` --chain ${chainSpecPathInNode} > `,
        );
      }
      commands.push(genesisWasmGenerator);
    }

    // Native provider doesn't need to wait
    if (client.providerName !== "native")
      commands.push(WAIT_UNTIL_SCRIPT_SUFIX);

    let node: Node = {
      name: getUniqueName("temp-collator"),
      validator: false,
      invulnerable: false,
      image: parachain.collators[0].image || DEFAULT_COLLATOR_IMAGE,
      fullCommand: commands.join(" && "),
      chain: chainName,
      bootnodes: [],
      args: [],
      env: [],
      telemetryUrl: "",
      overrides: [],
      zombieRole: "temp",
      p2pPort: await getRandomPort(),
      wsPort: await getRandomPort(),
      rpcPort: await getRandomPort(),
      prometheusPort: await getRandomPort(),
    };

    const provider = Providers.get(client.providerName);
    const podDef = await provider.genNodeDef(namespace, node);
    const podName = podDef.metadata.name;

    await client.spawnFromDef(podDef, filesToCopyToNodes);

    if (parachain.genesisStateGenerator) {
      await client.copyFileFromPod(
        podDef.metadata.name,
        `${client.remoteDir}/${GENESIS_STATE_FILENAME}`,
        stateLocalFilePath,
      );
    }

    if (parachain.genesisWasmGenerator) {
      await client.copyFileFromPod(
        podDef.metadata.name,
        `${client.remoteDir}/${GENESIS_WASM_FILENAME}`,
        wasmLocalFilePath,
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

  // add paths to para files
  parachain.wasmPath = wasmLocalFilePath;
  parachain.statePath = stateLocalFilePath;

  return;
}
