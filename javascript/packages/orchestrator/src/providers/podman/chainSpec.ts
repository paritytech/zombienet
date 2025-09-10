import { sleep } from "@zombienet/utils";
import { DEFAULT_CHAIN_SPEC, DEFAULT_CHAIN_SPEC_RAW } from "../../constants";
import { getClient } from "../client";
import { createTempNodeDef, genNodeDef } from "./dynResourceDefinition";
const debug = require("debug")("zombie::podman::chain-spec");

const { copyFileSync, readFileSync, promises } = require("fs");

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
  const client = getClient();
  if (chainConfig.chainSpecPath) {
    // copy file to temp to use
    copyFileSync(chainConfig.chainSpecPath, chainFullPath);
  } else {
    if (chainConfig.chainSpecCommand) {
      const { defaultImage, chainSpecCommand } = chainConfig;
      const plainChainSpecOutputFilePath =
        client.remoteDir +
        "/" +
        DEFAULT_CHAIN_SPEC.replace(/{{chainName}}/gi, chainName);
      // set output of command
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

      debug("copy file from pod");

      const podChainPath = `${client.tmpDir}/${podName}${plainChainSpecOutputFilePath}`;
      copyFileSync(podChainPath, chainFullPath);
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

      debug("Getting the presets file from pod to the local environment.");
      const podPresetsPath = `${client.tmpDir}/${listPresetsPodName}${listPresetsResultPath}`;
      copyFileSync(podPresetsPath, listPresetsResultPathLocal);

      const presetsFile = readFileSync(listPresetsResultPathLocal);
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

      debug("copy file from pod");

      const podChainPath = `${client.tmpDir}/${podName}${plainChainSpecOutputFilePath}`;
      copyFileSync(podChainPath, chainFullPath);
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
  const plainPath = chainFullPath.replace(".json", "-plain.json");
  const client = getClient();

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

  // let's just wait 2 secs
  await sleep(2000);

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
  try {
    const chainSpecContentTest = readFileSync(chainFullPath);
    JSON.parse(chainSpecContentTest.toString());
    isValid = true;
  } catch (e) {
    debug(e);
  }

  if (!isValid) {
    try {
      const result = await client.runCommand([
        "exec",
        `${podName}_pod-${podName}`,
        "cat",
        remoteChainSpecRawFullPath,
      ]);
      if (result.exitCode === 0 && result.stdout.length > 0) {
        // TODO: remove this debug when we get this fixed.
        debug(result.stdout);
        promises.writeFileSync(chainFullPath, result.stdout);
        isValid = true;
      }
    } catch (e) {
      debug(e);
    }
  }

  if (!isValid) throw new Error(`Invalid chain spec raw file generated.`);

  await client.putLocalMagicFile(podName, podName);
}
