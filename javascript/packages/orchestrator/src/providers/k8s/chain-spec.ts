import { sleep } from "@zombienet/utils";
import {
  DEFAULT_CHAIN_SPEC,
  DEFAULT_CHAIN_SPEC_COMMAND,
  DEFAULT_CHAIN_SPEC_RAW,
} from "../../constants";
import { getClient } from "../client";
import { createTempNodeDef, genNodeDef } from "./dynResourceDefinition";
const debug = require("debug")("zombie::kube::chain-spec");

const fs = require("fs").promises;

export async function setupChainSpec(
  namespace: string,
  chainConfig: any,
  chainName: string,
  chainFullPath: string,
): Promise<any> {
  // We have two options to get the chain-spec file, neither should use the `raw` file/argument
  // 1: User provide the file (we DON'T expect the raw file)
  // 2: User provide the chainSpecCommand (without the --raw option)
  const client = getClient();
  if (chainConfig.chainSpecPath) {
    await fs.copyFile(chainConfig.chainSpecPath, chainFullPath);
  } else {
    if (chainConfig.chainSpecCommand) {
      const { defaultImage, chainSpecCommand } = chainConfig;
      const plainChainSpecOutputFilePath =
        client.remoteDir +
        "/" +
        DEFAULT_CHAIN_SPEC.replace(/{{chainName}}/gi, chainName);

      const fullCommand = `${chainSpecCommand} > ${plainChainSpecOutputFilePath}`;
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
  chainCommand: string,
  chainFullPath: string,
): Promise<any> {
  const client = getClient();
  const plainPath = chainFullPath.replace(".json", "-plain.json");

  const remoteChainSpecFullPath =
    client.remoteDir +
    "/" +
    DEFAULT_CHAIN_SPEC.replace(/{{chainName}}/, chainName);
  const remoteChainSpecRawFullPath =
    client.remoteDir +
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

  await client.spawnFromDef(podDef, [
    {
      localFilePath: plainPath,
      remoteFilePath: remoteChainSpecFullPath,
    },
  ]);

  // let's just wait 2 secs before download
  // Creating the raw version can take a couple of seconds, loop until the `build-spec` command is done
  // or timedout (20 seconds) and fallback to the validation.
  for (let i = 0; i < 10; i++) {
    try {
      await client.runCommand([
        "exec",
        podName,
        "--",
        "ls",
        "/tmp/zombie-tmp-done",
      ]);
      // we can go ahead
      break;
    } catch (_) {
      debug("waiting for raw chain-spec");
      await sleep(2000);
    }
  }

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
    let content = require(chainFullPath);
    isValid = true;
  } catch (_) {}

  if (!isValid) {
    try {
      const result = await client.runCommand([
        "exec",
        podName,
        "--",
        "cat",
        remoteChainSpecRawFullPath,
      ]);
      if (result.exitCode === 0 && result.stdout.length > 0) {
        // TODO: remove this debug when we get this fixed.
        debug(result.stdout);
        fs.writeFileSync(chainFullPath, result.stdout);
        isValid = true;
      }
    } catch (_) {}
  }

  if (!isValid) throw new Error(`Invalid chain spec raw file generated.`);

  await client.putLocalMagicFile(podName, podName);
}
