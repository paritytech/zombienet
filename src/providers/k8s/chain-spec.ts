import { debug } from "console";
import { genPodDef, getClient } from ".";
import { DEFAULT_CHAIN_SPEC_PATH, TRANSFER_CONTAINER_NAME, FINISH_MAGIC_FILE, DEFAULT_CHAIN_SPEC_COMMAND, DEFAULT_CHAIN_SPEC_RAW_PATH } from "../../configManager";
import { ComputedNetwork } from "../../types";
import { createTempNodeDef, sleep, writeLocalJsonFile } from "../../utils";

import fs from "fs";

export async function setupChainSpec(namespace: string, networkSpec: ComputedNetwork, chainName: string, chainFullPath: string): Promise<any> {
    // We have two options to get the chain-spec file, neither should use the `raw` file/argument
    // 1: User provide the chainSpecCommand (without the --raw option)
    // 2: User provide the file (we DON'T expect the raw file)
    const client = getClient();
    if (networkSpec.relaychain.chainSpecCommand) {
        const { defaultImage, chainSpecCommand } = networkSpec.relaychain;
        // set output of command
        const fullCommand = `${chainSpecCommand} > ${DEFAULT_CHAIN_SPEC_PATH.replace(/{{chainName}}/ig, chainName)}`;
        const node = createTempNodeDef("temp", defaultImage, chainName, fullCommand);

        const podDef = await genPodDef(namespace, node);
        const podName = podDef.metadata.name;
        await client.spawnFromDef(podDef);

        debug("copy file from pod");
        await client.copyFileFromPod(
          podName,
          `/cfg/${chainName}.json`,
          chainFullPath,
          podName
        );

        await client.putLocalMagicFile(podName, podName);
    } else {
        if (networkSpec.relaychain.chainSpecPath) {
          // copy file to temp to use
          fs.copyFileSync(
            networkSpec.relaychain.chainSpecPath,
            chainFullPath
          );
        }
    }
}

export async function getChainSpecRaw(namespace: string, image: string, chainName: string, chainFullPath: string): Promise<any> {
    // backup plain file
    const plainPath = chainFullPath.replace(".json", "-plain.json");
    fs.copyFileSync(chainFullPath, plainPath);

    const remoteChainSpecFullPath = DEFAULT_CHAIN_SPEC_PATH.replace(/{{chainName}}/, chainName);
    const remoteChainSpecRawFullPath = DEFAULT_CHAIN_SPEC_RAW_PATH.replace(/{{chainName}}/, chainName);
    const chainSpecCommandRaw = DEFAULT_CHAIN_SPEC_COMMAND.replace(/{{chainName}}/ig, remoteChainSpecFullPath);
    const fullCommand = `${chainSpecCommandRaw}  --raw > ${remoteChainSpecRawFullPath}`;
    const node = createTempNodeDef("temp", image, chainName, fullCommand );

    const podDef = await genPodDef(namespace, node);
    const podName = podDef.metadata.name;

    const client = getClient();
    await client.spawnFromDef(podDef,[
        {
            localFilePath: chainFullPath,
            remoteFilePath: remoteChainSpecFullPath
        }
    ]);

    debug("copy raw chain spec file from pod");
    await client.copyFileFromPod(
        podName,
        remoteChainSpecRawFullPath,
        chainFullPath,
        podName
    );

    await client.putLocalMagicFile(podName, podName);
}