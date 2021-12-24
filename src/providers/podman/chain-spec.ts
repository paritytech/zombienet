import { genPodDef } from "./dynResourceDefinition";
import { getClient } from "../client";
import { DEFAULT_CHAIN_SPEC_PATH, DEFAULT_CHAIN_SPEC_COMMAND, DEFAULT_CHAIN_SPEC_RAW_PATH } from "../../configManager";
import { ComputedNetwork } from "../../types";
import { createTempNodeDef, sleep } from "../../utils";
const debug = require("debug")("zombie::kube::chain-spec");

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

    debug("Getting the raw chain spec file from pod to the local environment.");
    await client.copyFileFromPod(
        podName,
        remoteChainSpecRawFullPath,
        chainFullPath,
        podName
    );

    // let's just wait 2 secs before download
    await sleep(2000);

    // We had some issues where the `raw` file is empty
    // let's add some extra checks here to ensure we are ok.
    let isValid = false;
    try {
        let content = require(chainFullPath);
        isValid = true;
    } catch(_) {}

    if(!isValid) {
        try {
            const result = await client.runCommand(["exec", podName, "--", "cat", remoteChainSpecRawFullPath]);
            if(result.exitCode === 0 && result.stdout.length > 0) {
                // TODO: remove this debug when we get this fixed.
                debug(result.stdout);
                fs.writeFileSync(chainFullPath, result.stdout);
                isValid = true;
            }
        } catch(_){}
    }

    if(!isValid) throw new Error(`Invalid chain spec raw file generated.`);

    await client.putLocalMagicFile(podName, podName);
}