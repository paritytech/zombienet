import { createTempNodeDef, genNodeDef } from "./dynResourceDefinition";
import { getClient } from "../client";
import {
  DEFAULT_CHAIN_SPEC,
  DEFAULT_CHAIN_SPEC_COMMAND,
  DEFAULT_CHAIN_SPEC_RAW,
} from "../../constants";
import { ComputedNetwork } from "../../types";
import { sleep } from "../../utils/misc";
const debug = require("debug")("zombie::native::chain-spec");

const fs = require("fs").promises;

export async function setupChainSpec(
  namespace: string,
  chaninConfig: any,
  chainName: string,
  chainFullPath: string,
): Promise<any> {
  // We have two options to get the chain-spec file, neither should use the `raw` file/argument
  // 1: User provide the file (we DON'T expect the raw file)
  // 2: User provide the chainSpecCommand (without the --raw option)
  const client = getClient();
  if (chaninConfig.chainSpecPath) {
    // copy file to temp to use
    await fs.copyFile(chaninConfig.chainSpecPath, chainFullPath);
  } else {
    if (chaninConfig.chainSpecCommand) {
      const { defaultImage, chainSpecCommand } = chaninConfig;
      const plainChainSpecOutputFilePath =
        client.remoteDir +
        "/" +
        DEFAULT_CHAIN_SPEC.replace(/{{chainName}}/gi, chainName);
      // set output of command
      const fullCommand = `${chainSpecCommand} > ${plainChainSpecOutputFilePath}`;
      const node = await createTempNodeDef(
        "temp",
        defaultImage,
        chainName,
        fullCommand,
      );

      const podDef = await genNodeDef(namespace, node);
      await client.spawnFromDef(podDef);
      await fs.copyFile(plainChainSpecOutputFilePath, chainFullPath);
    }
  }
}

export async function getChainSpecRaw(
  namespace: string,
  image: string,
  chainName: string,
  chainCommand: string,
  chainFullPath: string,
): Promise<any> {
  const client = getClient();

  const remoteChainSpecFullPath =
    client.tmpDir +
    "/" +
    DEFAULT_CHAIN_SPEC.replace(/{{chainName}}/, chainName);
  const remoteChainSpecRawFullPath =
    client.tmpDir +
    "/" +
    DEFAULT_CHAIN_SPEC_RAW.replace(/{{chainName}}/, chainName);
  const chainSpecCommandRaw = DEFAULT_CHAIN_SPEC_COMMAND.replace(
    /{{chainName}}/gi,
    remoteChainSpecFullPath,
  ).replace("{{DEFAULT_COMMAND}}", chainCommand);

  const fullCommand = `${chainSpecCommandRaw}  --raw > ${remoteChainSpecRawFullPath}`;
  const node = await createTempNodeDef("temp", image, chainName, fullCommand);

  const podDef = await genNodeDef(namespace, node);
  const podName = podDef.metadata.name;

  await client.spawnFromDef(podDef);

  // let's just wait 2 secs
  await sleep(1000);

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
    require(chainFullPath);
    isValid = true;
  } catch (e) {
    debug(e);
  }

  if (!isValid) throw new Error(`Invalid chain spec raw file generated.`);

  await client.putLocalMagicFile(podName, podName);
}
