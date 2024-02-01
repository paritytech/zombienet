import { decorators, getRandomPort } from "@zombienet/utils";
import fs from "fs";
import chainSpecFns, { isRawSpec } from "./chainSpec";
import { getUniqueName } from "./configGenerator";
import {
  DEFAULT_COLLATOR_IMAGE,
  GENESIS_STATE_FILENAME,
  GENESIS_WASM_FILENAME,
  K8S_WAIT_UNTIL_SCRIPT_SUFIX,
  NODE_CONTAINER_WAIT_LOG,
  WAIT_UNTIL_SCRIPT_SUFIX,
} from "./constants";
import { decorate } from "./chain-decorators";
import { Providers } from "./providers";
import { getClient } from "./providers/client";
import { fileMap } from "./types";
import { Node, ZombieRole, Parachain } from "./sharedTypes";
import { KubeClient } from "./providers/k8s/kubeClient";

const debug = require("debug")("zombie::paras");

export async function generateParachainFiles(
  namespace: string,
  tmpDir: string,
  parachainFilesPath: string,
  relayChainName: string,
  parachain: Parachain,
  relayChainSpecIsRaw: boolean,
): Promise<void> {
  const [
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
  const GENESIS_STATE_FILENAME_WITH_ID = `${GENESIS_STATE_FILENAME}-${parachain.id}`;
  const GENESIS_WASM_FILENAME_WITH_ID = `${GENESIS_WASM_FILENAME}-${parachain.id}`;

  const stateLocalFilePath = `${parachainFilesPath}/${GENESIS_STATE_FILENAME}`;
  const wasmLocalFilePath = `${parachainFilesPath}/${GENESIS_WASM_FILENAME}`;
  const client = getClient();

  const { setupChainSpec, getChainSpecRaw } = Providers.get(
    client.providerName,
  );

  let chainSpecFullPath;
  const chainName = `${parachain.chain ? parachain.chain + "-" : ""}${
    parachain.name
  }-${relayChainName}`;
  const chainSpecFileName = `${chainName}.json`;

  const chainSpecFullPathPlain = `${tmpDir}/${chainName}-plain.json`;

  if (parachain.cumulusBased) {
    // need to create the parachain spec
    // file name template is [para chain-]<para name>-<relay chain>
    const relayChainSpecFullPathPlain = `${tmpDir}/${relayChainName}-plain.json`;

    // Check if the chain-spec file is provided.
    if (parachain.chainSpecPath) {
      debug("parachain chain spec provided");
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
          chainSpecCommand: parachain.chainSpecCommand!,
          defaultImage: parachain.collators[0].image,
        },
        parachain.chain,
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
      else if (
        plainData.genesis.runtimeGenesis?.patch?.parachainInfo?.parachainId
      )
        plainData.genesis.runtimeGenesis.patch.parachainInfo.parachainId =
          parachain.id;
      else if (
        plainData.genesis.runtimeGenesis?.config?.parachainInfo?.parachainId
      )
        plainData.genesis.runtimeGenesis.config.parachainInfo.parachainId =
          parachain.id;

      writeChainSpec(chainSpecFullPathPlain, plainData);

      // make genesis overrides first.
      if (parachain.genesis)
        await changeGenesisConfig(chainSpecFullPathPlain, parachain.genesis);

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

      debug("creating chain spec raw");
      // ensure needed file
      if (parachain.chain)
        fs.copyFileSync(
          chainSpecFullPathPlain,
          `${tmpDir}/${parachain.chain}-${parachain.name}-plain.json`,
        );
      // Generate the raw chain-spec logic

      // Make sure we include the plain chain-spec
      const chainSpecRawCommand = getChainSpecCmdRaw(
        parachain.chainSpecCommand!,
      );

      await getChainSpecRaw(
        namespace,
        parachain.collators[0].image,
        `${parachain.chain ? parachain.chain + "-" : ""}${
          parachain.name
        }-${relayChainName}`,
        chainSpecRawCommand,
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

  // state and wasm files are only needed:
  // IFF the relaychain is NOT RAW or
  // IFF the relaychain is raw and addToGenesis is false for the parachain
  const stateAndWasmAreNeeded = !(
    relayChainSpecIsRaw && parachain.addToGenesis
  );
  // check if we need to create files
  if (
    stateAndWasmAreNeeded &&
    (parachain.genesisStateGenerator || parachain.genesisWasmGenerator)
  ) {
    const filesToCopyToNodes: fileMap[] = [];
    if (parachain.cumulusBased && chainSpecFullPath)
      filesToCopyToNodes.push({
        localFilePath: chainSpecFullPath,
        remoteFilePath: `${client.remoteDir}/${chainSpecFileName}`,
      });

    const commands = [];
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

        genesisStateGenerator = injectChainInCmd(
          genesisStateGenerator,
          chainSpecPathInNode!,
        );
      }

      if (client.providerName === "native" && !parachain.cumulusBased) {
        // Inject a tmp base-path to prevent the use of a pre-existing un-purged data directory. This should only
        // be injected for `cumulus` base parachains.
        // See https://github.com/paritytech/zombienet/issues/1519
        // NOTE: this is only needed in native provider since un k8s/podman the fs is always fresh
        const exportGenesisStateCustomPath = `${client.tmpDir}/export-genesis-state/${parachain.id}`;
        await fs.promises.mkdir(exportGenesisStateCustomPath, {
          recursive: true,
        });
        genesisStateGenerator = injectBasePathInCmd(
          genesisStateGenerator,
          exportGenesisStateCustomPath,
        );
      }

      commands.push(`${genesisStateGenerator}-${parachain.id}`);
    }
    if (parachain.genesisWasmGenerator) {
      let genesisWasmGenerator = parachain.genesisWasmGenerator.replace(
        "{{CLIENT_REMOTE_DIR}}",
        client.remoteDir as string,
      );
      // cumulus
      if (parachain.collators[0].zombieRole === ZombieRole.CumulusCollator) {
        const chainSpecPathInNode =
          client.providerName === "native"
            ? chainSpecFullPath
            : `${client.remoteDir}/${chainSpecFileName}`;

        genesisWasmGenerator = injectChainInCmd(
          genesisWasmGenerator,
          chainSpecPathInNode!,
        );
      }
      commands.push(`${genesisWasmGenerator}-${parachain.id}`);
    }

    // Native provider doesn't need to wait
    if (client.providerName == "kubernetes")
      commands.push(K8S_WAIT_UNTIL_SCRIPT_SUFIX);
    else if (client.providerName == "podman")
      commands.push(WAIT_UNTIL_SCRIPT_SUFIX);

    const node: Node = {
      name: getUniqueName("temp-collator"),
      validator: false,
      invulnerable: false,
      image: parachain.collators[0].image || DEFAULT_COLLATOR_IMAGE,
      fullCommand: commands.join(" && "),
      chain: relayChainName,
      bootnodes: [],
      args: [],
      env: [],
      telemetryUrl: "",
      overrides: [],
      zombieRole: ZombieRole.Temp,
      p2pPort: await getRandomPort(),
      wsPort: await getRandomPort(),
      rpcPort: await getRandomPort(),
      prometheusPort: await getRandomPort(),
    };

    const provider = Providers.get(client.providerName);
    const podDef = await provider.genNodeDef(namespace, node);
    const podName = podDef.metadata.name;

    await client.spawnFromDef(podDef, filesToCopyToNodes);

    if (client.providerName === "kubernetes") {
      debug("waiting for artifacts been created in pod");
      await (client as KubeClient).waitLog(
        podName,
        podName,
        NODE_CONTAINER_WAIT_LOG,
      );
    }

    if (parachain.genesisStateGenerator) {
      await client.copyFileFromPod(
        podDef.metadata.name,
        `${client.remoteDir}/${GENESIS_STATE_FILENAME_WITH_ID}`,
        stateLocalFilePath,
      );
    }

    if (parachain.genesisWasmGenerator) {
      await client.copyFileFromPod(
        podDef.metadata.name,
        `${client.remoteDir}/${GENESIS_WASM_FILENAME_WITH_ID}`,
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

function getChainSpecCmdRaw(chainSpecCommand: string) {
  // Default to the provided cmd, will work for custom generator.
  let returnCmd = chainSpecCommand;
  const parts = chainSpecCommand!
    .split(" ")
    .filter((part: string) => part.length);
  if (parts.includes("build-spec") && !parts.includes("--chain")) {
    returnCmd = `${chainSpecCommand} --chain {{chainName}}`;
  }

  return returnCmd;
}

// Inject the chain (e.g. --chain <chain path>) before the output file or the
// shell redirection `>`.
function injectChainInCmd(cmd: string, chain: string): string {
  const parts = cmd.split(" ").filter(Boolean);
  const l = parts.length;
  const index = parts[l - 2] == ">" ? l - 2 : l - 1;
  parts.splice(index, 0, `--chain ${chain}`);
  return parts.join(" ");
}

// Inject the base-path  (e.g. --base-path <path> or -d <path>)
// IFF is not present
function injectBasePathInCmd(cmd: string, path: string): string {
  const parts = cmd.split(" ").filter(Boolean);
  // IFF is present don't modify the cmd
  if (parts.includes("-d") || parts.includes("--base-path")) return cmd;

  // inject just after the subcommand
  parts.splice(2, 0, `-d ${path}`);
  return parts.join(" ");
}
