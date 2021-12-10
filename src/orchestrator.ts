import { Providers } from "./providers/";
import { LaunchConfig, ComputedNetwork, Node } from "./types";
import {
  generateNetworkSpec,
  generateBootnodeSpec,
  getUniqueName,
  FINISH_MAGIC_FILE,
  DEFAULT_COLLATOR_IMAGE,
  GENESIS_STATE_FILENAME,
  GENESIS_WASM_FILENAME,
  PROMETHEUS_PORT,
  DEFAULT_BOOTNODE_PEER_ID,
  WAIT_UNTIL_SCRIPT_SUFIX,
  TRANSFER_CONTAINER_NAME,
  WS_URI_PATTERN,
  METRICS_URI_PATTERN,
} from "./configManager";
import { Network } from "./network";
import { NetworkNode } from "./networkNode";
import { startPortForwarding } from "./portForwarder";
import { ApiPromise, WsProvider } from "@polkadot/api";
import {
  generateNamespace,
  sleep,
  filterConsole,
  writeLocalJsonFile,
  loadTypeDef,
} from "./utils";
import tmp from "tmp-promise";
import fs from "fs";
import { resolve } from "path";

const debug = require("debug")("zombie");

// For now the only provider is k8s
const { genBootnodeDef, genPodDef, initClient } = Providers.Kubernetes;

const ZOMBIE_WRAPPER = "zombie-wrapper.sh";

// Hide some warning messages that are coming from Polkadot JS API.
// TODO: Make configurable.
filterConsole([
  `code: '1006' reason: 'connection failed'`,
  `API-WS: disconnected`,
]);

export async function start(
  credentials: string,
  networkConfig: LaunchConfig,
  monitor: boolean = false,
  withMetrics: boolean = false
) {
  let network: Network | undefined;
  let cronInterval = undefined;
  try {
    // Parse and build Network definition
    const networkSpec: ComputedNetwork = generateNetworkSpec(networkConfig);
    debug(JSON.stringify(networkSpec, null, 4));

    // global timeout
    setTimeout(() => {
      if (network && !network.launched) {
        throw new Error(
          `GLOBAL TIMEOUT (${networkSpec.settings.timeout} secs) `
        );
      }
    }, networkSpec.settings.timeout * 1000);

    // Create namespace
    const namespace = `zombie-${generateNamespace()}`;

    // Chain name and file name
    const chainSpecFileName = `${networkSpec.relaychain.chain}.json`;
    const chainName = networkSpec.relaychain.chain;

    // get user defined types
    const userDefinedTypes: any = loadTypeDef(networkSpec.types);

    // create tmp directory to store needed files
    const tmpDir = await tmp.dir({ prefix: `${namespace}_` });
    const localMagicFilepath = `${tmpDir.path}/finished.txt`;
    debug(`\t Temp Dir: ${tmpDir.path}`);

    // const client = new KubeClient(credentials, namespace, tmpDir.path);
    const client = initClient(credentials, namespace, tmpDir.path);
    network = new Network(client, namespace, tmpDir.path);

    console.log(`\t Launching network under namespace: ${namespace}`);
    debug(`\t Launching network under namespace: ${namespace}`);

    // validate access to cluster
    const isValid = await client.validateAccess();
    if (!isValid) {
      console.error(
        "  ⚠ Can not access k8s cluster, please check your config."
      );
      process.exit(1);
    }

    // Create MAGIC file to stop temp/init containers
    fs.openSync(localMagicFilepath, "w");

    const zombieWrapperPath = resolve(
      __dirname,
      `../scripts/${ZOMBIE_WRAPPER}`
    );

    // create namespace
    const namespaceDef = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        name: namespace,
      },
    };

    writeLocalJsonFile(tmpDir.path, "namespace", namespaceDef);
    await client.createResource(namespaceDef);

    // Create bootnode and backchannel services
    debug(`Creating bootnode and backchannel services`);
    await client.crateStaticResource("bootnode-service.yaml");
    await client.crateStaticResource("backchannel-service.yaml");
    await client.crateStaticResource("backchannel-pod.yaml");

    // create basic infra metrics if needed
    // if (withMetrics) await client.staticSetup();
    await client.createPodMonitor("pod-monitor.yaml", chainName);



    // setup cleaner
    if (!monitor) cronInterval = await client.setupCleaner();



    if (networkSpec.relaychain.chainSpecCommand) {
      let node: Node = {
        name: getUniqueName("temp"),
        validator: false,
        image: networkSpec.relaychain.defaultImage,
        fullCommand:
          networkSpec.relaychain.chainSpecCommand +
          " && " +
          WAIT_UNTIL_SCRIPT_SUFIX, // leave the pod runnig until we finish transfer files
        chain: networkSpec.relaychain.chain,
        bootnodes: [],
        args: [],
        env: [],
        telemetryUrl: "",
        overrides: [],
      };

      const podDef = await genPodDef(namespace, node);
      debug(
        `launching ${podDef.metadata.name} pod with image ${podDef.spec.containers[0].image}`
      );
      debug(`command: ${podDef.spec.containers[0].command.join(" ")}`);
      writeLocalJsonFile(tmpDir.path, "temp", podDef);

      await client.createResource(podDef, true, false);
      await client.wait_transfer_container(podDef.metadata.name);

      for (const override of networkSpec.relaychain.overrides) {
        await client.copyFileToPod(
          podDef.metadata.name,
          override.local_path,
          override.remote_path,
          TRANSFER_CONTAINER_NAME
        );
      }

      await client.copyFileToPod(
        podDef.metadata.name,
        localMagicFilepath,
        FINISH_MAGIC_FILE,
        TRANSFER_CONTAINER_NAME
      );

      await client.wait_pod_ready(podDef.metadata.name);
      const fileName = `${networkSpec.relaychain.chain}.json`;
      debug("copy file from pod");

      await client.copyFileFromPod(
        podDef.metadata.name,
        `/cfg/${networkSpec.relaychain.chain}-plain.json`,
        `${tmpDir.path}/${networkSpec.relaychain.chain}-plain.json`,
        podDef.metadata.name
      );

      await client.copyFileFromPod(
        podDef.metadata.name,
        `/cfg/${fileName}`,
        `${tmpDir.path}/${fileName}`,
        podDef.metadata.name
      );

      await client.copyFileToPod(
        podDef.metadata.name,
        localMagicFilepath,
        FINISH_MAGIC_FILE
      );
      sleep(300 * 1000);
    } else {
      if (networkSpec.relaychain.chainSpecPath) {
        // copy file to temp to use
        fs.copyFileSync(
          networkSpec.relaychain.chainSpecPath,
          `${tmpDir.path}/${chainSpecFileName}`
        );
      }
    }

    // check if we have the chain spec file
    if (!fs.existsSync(`${tmpDir.path}/${chainSpecFileName}`))
      throw new Error("Can't find chain spec file!");

    // bootnode
    // TODO: allow to customize the bootnode
    const bootnodeSpec = await generateBootnodeSpec(networkSpec);
    const bootnodeDef = await genBootnodeDef(namespace, bootnodeSpec);
    // debug(JSON.stringify(bootnodeDef, null, 4 ));
    debug(
      `launching ${bootnodeDef.metadata.name} pod with image ${bootnodeDef.spec.containers[0].image}`
    );
    debug(`command: ${bootnodeDef.spec.containers[0].command.join(" ")}`);
    writeLocalJsonFile(tmpDir.path, "bootnode", bootnodeDef);
    await client.createResource(bootnodeDef, true, false);
    await client.wait_transfer_container(bootnodeDef.metadata.name);

    await client.copyFileToPod(
      bootnodeDef.metadata.name,
      `${tmpDir.path}/${chainSpecFileName}`,
      `/cfg/${chainSpecFileName}`,
      TRANSFER_CONTAINER_NAME
    );

    await client.copyFileToPod(
      bootnodeDef.metadata.name,
      zombieWrapperPath,
      `/cfg/${ZOMBIE_WRAPPER}`,
      TRANSFER_CONTAINER_NAME
    );

    await client.copyFileToPod(
      bootnodeDef.metadata.name,
      localMagicFilepath,
      FINISH_MAGIC_FILE,
      TRANSFER_CONTAINER_NAME
    );

    await client.wait_pod_ready(bootnodeDef.metadata.name);

    await client.copyFileToPod(
      bootnodeDef.metadata.name,
      localMagicFilepath,
      FINISH_MAGIC_FILE
    );

    // make sure the bootnode is up and available over DNS
    await sleep(5000);

    const bootnodeIdentifier = `${bootnodeDef.kind}/${bootnodeDef.metadata.name}`;
    const fwdPort = await startPortForwarding(9944, bootnodeIdentifier, client);
    const prometheusPort = await startPortForwarding(
      PROMETHEUS_PORT,
      bootnodeIdentifier,
      client
    );
    // const wsUri = `ws://127.0.0.1:${fwdPort}`;
    // const prometheusUri = `http://127.0.0.1:${prometheusPort}/metrics`;
    // const provider = new WsProvider(wsUri);
    // debug(`creating api connection for ${bootnodeDef.metadata.name}`);
    // const api = await ApiPromise.create({ provider, types: userDefinedTypes });

    const bootnodeNode: NetworkNode = new NetworkNode(
      bootnodeDef.metadata.name,
      WS_URI_PATTERN.replace("{{PORT}}", fwdPort.toString()),
      METRICS_URI_PATTERN.replace("{{PORT}}", prometheusPort.toString())
    );

    network.addNode(bootnodeNode);

    const bootnodeIP = await client.getBootnodeIP();
    // Create nodes
    for (const node of networkSpec.relaychain.nodes) {
      // TODO: k8s don't see pods by name so in here we inject the bootnode ip
      node.bootnodes = [
        `/dns/${bootnodeIP}/tcp/30333/p2p/${DEFAULT_BOOTNODE_PEER_ID}`,
      ];
      // create the node and attach to the network object
      debug(`creating node: ${node.name}`);
      const podDef = await genPodDef(namespace, node);

      debug(
        `launching ${podDef.metadata.name} pod with image ${podDef.spec.containers[0].image}`
      );
      debug(`command: ${podDef.spec.containers[0].command.join(" ")}`);

      writeLocalJsonFile(tmpDir.path, node.name, podDef);
      await client.createResource(podDef, true, false);
      await client.wait_transfer_container(podDef.metadata.name);

      await client.copyFileToPod(
        podDef.metadata.name,
        `${tmpDir.path}/${chainSpecFileName}`,
        `/cfg/${chainSpecFileName}`,
        TRANSFER_CONTAINER_NAME
      );

      await client.copyFileToPod(
        podDef.metadata.name,
        zombieWrapperPath,
        `/cfg/${ZOMBIE_WRAPPER}`,
        TRANSFER_CONTAINER_NAME
      );

      for (const override of node.overrides) {
        await client.copyFileToPod(
          podDef.metadata.name,
          override.local_path,
          override.remote_path,
          TRANSFER_CONTAINER_NAME
        );
      }

      await client.copyFileToPod(
        podDef.metadata.name,
        localMagicFilepath,
        FINISH_MAGIC_FILE,
        TRANSFER_CONTAINER_NAME
      );

      await client.wait_pod_ready(podDef.metadata.name);
      debug(`${podDef.metadata.name} pod is ready!`);

      const nodeIdentifier = `${podDef.kind}/${podDef.metadata.name}`;
      const fwdPort = await startPortForwarding(9944, nodeIdentifier, client);
      const nodePrometheusPort = await startPortForwarding(
        PROMETHEUS_PORT,
        nodeIdentifier,
        client
      );

      const networkNode: NetworkNode = new NetworkNode(
        node.name,
        WS_URI_PATTERN.replace("{{PORT}}", fwdPort.toString()),
        METRICS_URI_PATTERN.replace("{{PORT}}", nodePrometheusPort.toString()),
        userDefinedTypes
      );
      network.addNode(networkNode);
    }

    console.log("\t All relay chain nodes spawned...");
    debug("\t All relay chain nodes spawned...");
    // sleep 2 secs before connect the api
    await sleep(2000);

    for (const node of network.nodes) {
      await node.connectApi();
    }

    for (const parachain of networkSpec.parachains) {
      let wasmLocalFilePath, stateLocalFilePath;
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
          chain: networkSpec.relaychain.chain,
          bootnodes: [],
          args: [],
          env: [],
          telemetryUrl: "",
          overrides: [],
        };
        const podDef = await genPodDef(namespace, node);

        debug(
          `launching ${podDef.metadata.name} pod with image ${podDef.spec.containers[0].image}`
        );
        debug(`command: ${podDef.spec.containers[0].command.join(" ")}`);

        await client.createResource(podDef, true, false);
        await client.wait_transfer_container(podDef.metadata.name);

        await client.copyFileToPod(
          podDef.metadata.name,
          localMagicFilepath,
          FINISH_MAGIC_FILE,
          TRANSFER_CONTAINER_NAME
        );

        await client.wait_pod_ready(podDef.metadata.name);

        if (parachain.genesisStateGenerator) {
          stateLocalFilePath = `${tmpDir.path}/${GENESIS_STATE_FILENAME}`;
          await client.copyFileFromPod(
            podDef.metadata.name,
            `/cfg/${GENESIS_STATE_FILENAME}`,
            stateLocalFilePath
          );
        }

        if (parachain.genesisWasmGenerator) {
          wasmLocalFilePath = `${tmpDir.path}/${GENESIS_WASM_FILENAME}`;
          await client.copyFileFromPod(
            podDef.metadata.name,
            `/cfg/${GENESIS_WASM_FILENAME}`,
            wasmLocalFilePath
          );
        }

        // put file to terminate pod
        await client.copyFileToPod(
          podDef.metadata.name,
          localMagicFilepath,
          FINISH_MAGIC_FILE
        );
      }

      if (!stateLocalFilePath) stateLocalFilePath = parachain.genesisStatePath;
      if (!wasmLocalFilePath) wasmLocalFilePath = parachain.genesisWasmPath;

      // CHECK
      if (!stateLocalFilePath || !wasmLocalFilePath)
        throw new Error("Invalid state or wasm files");

      // register parachain
      await network.registerParachain(
        parachain.id,
        wasmLocalFilePath,
        stateLocalFilePath
      );

      // let finalCommandWithArgs =
      //   parachain.collator.commandWithArgs || parachain.collator.command;

      // create collator
      let collator: Node = {
        name: getUniqueName(parachain.collator.name),
        validator: false,
        image: parachain.collator.image,
        command: parachain.collator.command,
        chain: networkSpec.relaychain.chain,
        bootnodes: [
          `/dns/${bootnodeIP}/tcp/30333/p2p/${DEFAULT_BOOTNODE_PEER_ID}`,
        ],
        args: [],
        env: [],
        telemetryUrl: "",
        overrides: [],
      };
      const podDef = await genPodDef(namespace, collator);

      debug(
        `launching ${podDef.metadata.name} pod with image ${podDef.spec.containers[0].image}`
      );
      debug(`command: ${podDef.spec.containers[0].command.join(" ")}`);

      writeLocalJsonFile(tmpDir.path, parachain.collator.name, podDef);
      await client.createResource(podDef, true, false);
      await client.wait_transfer_container(podDef.metadata.name);

      await client.copyFileToPod(
        podDef.metadata.name,
        `${tmpDir.path}/${chainSpecFileName}`,
        `/cfg/${chainSpecFileName}`,
        TRANSFER_CONTAINER_NAME
      );

      await client.copyFileToPod(
        podDef.metadata.name,
        zombieWrapperPath,
        `/cfg/${ZOMBIE_WRAPPER}`,
        TRANSFER_CONTAINER_NAME
      );

      await client.copyFileToPod(
        podDef.metadata.name,
        localMagicFilepath,
        FINISH_MAGIC_FILE,
        TRANSFER_CONTAINER_NAME
      );

      await client.wait_pod_ready(podDef.metadata.name);

      const networkNode: NetworkNode = new NetworkNode(
        podDef.metadata.name,
        "", // TODO: needs to connect to rpc?
        "" // TODO: needs to connect for metrics?
      );

      network.addNode(networkNode);
    }

    // prevent global timeout
    network.launched = true;
    debug(`\t 🚀 LAUNCH COMPLETE under namespace ${namespace} 🚀`);
    return network;
  } catch (error) {
    console.error(error);
    if (network) {
      await network.uploadLogs();
      await network.stop();
    }
    if (cronInterval) clearInterval(cronInterval);
    process.exit(1);
  }
}

export async function test(
  credentials: string,
  networkConfig: LaunchConfig,
  cb: (network: Network) => void
) {
  let network: Network | undefined;
  try {
    network = await start(credentials, networkConfig);
    await cb(network);
  } catch (error) {
    console.error(error);
  } finally {
    if (network) {
      await network.uploadLogs();
      await network.stop();
    }
  }
}
