import { promises as fsPromises, writeFileSync } from "fs";
import {
  DEFAULT_CHAIN_SPEC,
  DEFAULT_CHAIN_SPEC_RAW,
  NODE_CONTAINER_WAIT_LOG,
} from "../../constants";
import { getClient } from "../client";
import { createTempNodeDef, genNodeDef } from "./dynResourceDefinition";
import { KubeClient } from "./kubeClient";

const debug = require("debug")("zombie::kube::chain-spec");

export async function setupChainSpec(
  namespace: string,
  chainConfig: any,
  chainName: string,
  chainFullPath: string,
): Promise<any> {
  // We have two options to get the chain-spec file, neither should use the `raw` file/argument
  // 1: User provide the file (we DON'T expect the raw file)
  // 2: User provide the chainSpecCommand (without the --raw option)
  // 3: User provide the runtimePath, and we use chain-spec-builder
  const client = getClient() as KubeClient;
  if (chainConfig.chainSpecPath) {
    await fsPromises.copyFile(chainConfig.chainSpecPath, chainFullPath);
  } else {
    if (chainConfig.chainSpecCommand) {
      const { defaultImage, chainSpecCommand } = chainConfig;
      const plainChainSpecOutputFilePath =
        client.remoteDir +
        "/" +
        DEFAULT_CHAIN_SPEC.replace(/{{chainName}}/gi, chainName);

      const fullCommand = `${chainSpecCommand.replace(
        /{{chainName}}/gi,
        chainName,
      )} > ${plainChainSpecOutputFilePath}`;
      const node = await createTempNodeDef(
        "temp",
        defaultImage,
        chainName,
        fullCommand,
      );

      const podDef = await genNodeDef(namespace, node);
      const podName = podDef.metadata.name;
      await client.spawnFromDef(podDef);

      debug("waiting for chain-spec");
      await client.waitLog(podName, podName, NODE_CONTAINER_WAIT_LOG);

      debug("Getting the chain spec file from pod to the local environment.");
      await client.copyFileFromPod(
        podName,
        plainChainSpecOutputFilePath,
        chainFullPath,
        podName,
      );

      await client.putLocalMagicFile(podName, podName);
    } else if (chainConfig.buildWithChainSpecBuilderOpts) {
      const { defaultImage, tmpDir } = chainConfig;
      const {
        runtimePath,
        buildWithPresetCommand,
        buildDefaultCommand,
        listPresetsCommand,
      } = chainConfig.buildWithChainSpecBuilderOpts;
      const plainChainSpecOutputFilePath =
        client.remoteDir +
        "/" +
        DEFAULT_CHAIN_SPEC.replace(/{{chainName}}/gi, chainName);
      const runtimeRemotePath = `${client.remoteDir}/${chainName}-runtime.wasm`;

      // list presets
      const listPresetsResultPath = `${client.remoteDir}/list-presets-result-${chainName}`;
      const listPresetsResultPathLocal = `${tmpDir}/list-presets-result-${chainName}`;
      const listPresetsNode = await createTempNodeDef(
        "temp-presets",
        defaultImage,
        chainName,
        `${listPresetsCommand} > ${listPresetsResultPath}`.replace(
          /{{runtimePath}}/gi,
          runtimeRemotePath,
        ),
      );
      const listPresetsPodDef = await genNodeDef(namespace, listPresetsNode);
      const listPresetsPodName = listPresetsPodDef.metadata.name;
      await client.spawnFromDef(listPresetsPodDef, [
        {
          localFilePath: runtimePath,
          remoteFilePath: runtimeRemotePath,
        },
      ]);

      debug("waiting for listing presets");
      await client.waitLog(
        listPresetsPodName,
        listPresetsPodName,
        NODE_CONTAINER_WAIT_LOG,
      );

      debug("Getting the presets file from pod to the local environment.");
      await client.copyFileFromPod(
        listPresetsPodName,
        listPresetsResultPath,
        listPresetsResultPathLocal,
        listPresetsPodName,
      );

      const presetsFile = await fsPromises.readFile(
        listPresetsResultPathLocal,
        "utf-8",
      );
      const presetsResult = JSON.parse(presetsFile) as { presets: string[] };
      const matches = presetsResult.presets.includes(chainName);

      const chainSpecCommand = matches
        ? buildWithPresetCommand
            .replace(/{{outputPath}}/gi, plainChainSpecOutputFilePath)
            .replace(/{{runtimePath}}/gi, runtimeRemotePath)
        : buildDefaultCommand
            .replace(/{{outputPath}}/gi, plainChainSpecOutputFilePath)
            .replace(/{{runtimePath}}/gi, runtimeRemotePath);

      const fullCommand = `${chainSpecCommand.replace(
        /{{chainName}}/gi,
        chainName,
      )}`;

      const node = await createTempNodeDef(
        "temp",
        defaultImage,
        chainName,
        fullCommand,
      );
      const podDef = await genNodeDef(namespace, node);
      const podName = podDef.metadata.name;
      await client.spawnFromDef(podDef, [
        {
          localFilePath: runtimePath,
          remoteFilePath: runtimeRemotePath,
        },
      ]);

      debug("waiting for chain-spec");
      await client.waitLog(podName, podName, NODE_CONTAINER_WAIT_LOG);

      debug("Getting the chain spec file from pod to the local environment.");
      await client.copyFileFromPod(
        podName,
        plainChainSpecOutputFilePath,
        chainFullPath,
        podName,
      );

      await client.putLocalMagicFile(podName, podName);
    }
  }
}

export async function getChainSpecRaw(
  namespace: string,
  image: string,
  chainName: string,
  chainSpecCommand: string,
  chainFullPath: string,
): Promise<any> {
  const client = getClient() as KubeClient;
  const plainPath = chainFullPath.replace(".json", "-plain.json");

  const remoteChainSpecFullPath =
    client.remoteDir +
    "/" +
    DEFAULT_CHAIN_SPEC.replace(/{{chainName}}/, chainName);
  const remoteChainSpecRawFullPath =
    client.remoteDir +
    "/" +
    DEFAULT_CHAIN_SPEC_RAW.replace(/{{chainName}}/, chainName);
  const chainSpecCommandRaw = chainSpecCommand.replace(
    /{{chainName}}/gi,
    remoteChainSpecFullPath,
  );

  const fullCommand = `${chainSpecCommandRaw}  --raw > ${remoteChainSpecRawFullPath}`;
  const node = await createTempNodeDef("temp", image, chainName, fullCommand);

  const podDef = await genNodeDef(namespace, node);
  const podName = podDef.metadata.name;

  await client.spawnFromDef(podDef, [
    {
      localFilePath: plainPath,
      remoteFilePath: remoteChainSpecFullPath,
    },
  ]);

  debug("waiting for raw chainSpec");
  await client.waitLog(podName, podName, NODE_CONTAINER_WAIT_LOG);

  debug("Getting the raw chain spec file from pod to the local environment.");
  await client.copyFileFromPod(
    podName,
    remoteChainSpecRawFullPath,
    chainFullPath,
    podName,
  );

  // We had some issues where the `raw` file is empty
  // let's add some extra checks here to ensure we are ok.
  let isValid = false;

  if (!isValid) {
    try {
      const result = await client.runCommand([
        "exec",
        podName,
        "--",
        "/cfg/coreutils",
        "cat",
        remoteChainSpecRawFullPath,
      ]);
      if (result.exitCode === 0 && result.stdout.length > 0) {
        // TODO: remove this debug when we get this fixed.
        debug(result.stdout);
        writeFileSync(chainFullPath, result.stdout);
        isValid = true;
      }
    } catch (e) {
      debug(e);
    }
  }

  if (!isValid) throw new Error(`Invalid chain spec raw file generated.`);

  await client.putLocalMagicFile(podName, podName);
}
