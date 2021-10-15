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
} from "./configManager";
import { Network } from "./network";
import { NetworkNode } from "./networkNode";
import { startPortForwarding } from "./portForwarder";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { generateNamespace, sleep, filterConsole } from "./utils";
import tmp from "tmp-promise";
import fs from "fs";

var debug = require('debug')('zombie');

// For now the only provider is k8s
const { KubeClient, genBootnodeDef, genPodDef } = Providers.Kubernetes;

const WAIT_UNTIL_SCRIPT_SUFIX = `until [ -f ${FINISH_MAGIC_FILE} ]; do echo waiting for tar to finish; sleep 1; done; echo tar has finished`;

// Hide some warning messages that are coming from Polkadot JS API.
// TODO: Make configurable.
filterConsole([
  `code: '1006' reason: 'connection failed'`,
  `API-WS: disconnected`,
]);

export async function start(
  credentials: string,
  networkConfig: LaunchConfig,
  withMetrics: boolean = false
) {
  let network: Network | undefined;
  let transferIdentifier: string = "";
  let cronInterval = undefined;
  try {
    // Parse and build Network definition
    const networkSpec: ComputedNetwork = generateNetworkSpec(networkConfig);

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
    const client = new KubeClient(credentials, namespace);
    network = new Network(client, namespace);

    debug(`\t Launching network under namespace: ${namespace}`);

    // validate access to cluster
    const isValid = await client.validateAccess();
    if (!isValid) {
      console.error(
        "  ⚠ Can not access k8s cluster, please check your config."
      );
      process.exit(1);
    }

    // create tmp directory to store needed files
    const tempDir = await tmp.dir({ prefix: `${namespace}_` });
    const localMagicFilepath = `${tempDir.path}/finished.txt`;
    debug(`\t Temp Dir: ${tempDir.path}`);
    // Create MAGIC file to stop temp/init containers
    fs.openSync(localMagicFilepath, "w");

    // create namespace
    const namespaceDef = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        name: namespace,
      },
    };

    await client.crateResource(namespaceDef);

    // create basic infra metrics if needed
    if (withMetrics) await client.staticSetup();

    // setup cleaner
    cronInterval = await client.setupCleaner();

    // bootnode
    // TODO: allow to customize the bootnode
    const bootnodeSpec = await generateBootnodeSpec(networkSpec);
    const bootnodeDef = await genBootnodeDef(client, bootnodeSpec);
    await client.crateResource(bootnodeDef, true, true);

    // make sure the bootnode is up and available over DNS
    await sleep(4000);

    const identifier = `${bootnodeDef.kind}/${bootnodeDef.metadata.name}`;
    const fwdPort = await startPortForwarding(9944, identifier, client);
    const prometheusPort = await startPortForwarding(
      PROMETHEUS_PORT,
      identifier,
      client
    );
    const wsUri = `ws://127.0.0.1:${fwdPort}`;
    const prometheusUri = `http://127.0.0.1:${prometheusPort}/metrics`;
    const provider = new WsProvider(wsUri);
    const api = await ApiPromise.create({ provider });

    const networkNode: NetworkNode = new NetworkNode(
      bootnodeDef.metadata.name,
      wsUri,
      prometheusUri
    );
    networkNode.apiInstance = api;
    network.addNode(networkNode);

    if (networkSpec.relaychain.chainSpecCommand) {
      let node: Node = {
        name: getUniqueName("temp"),
        validator: false,
        image: networkSpec.relaychain.defaultImage,
        commandWithArgs:
          networkSpec.relaychain.chainSpecCommand +
          " && " +
          WAIT_UNTIL_SCRIPT_SUFIX, // leave the pod runnig until we finish transfer files
        chain: networkSpec.relaychain.chain,
        bootnodes: [],
        args: [],
        env: [],
        autoConnectApi: false,
        telemetryUrl: "",
      };
      const podDef = await genPodDef(client, node);
      await client.crateResource(podDef, true, true);
      const identifier = `${podDef.metadata.name}`;
      const fileName = `${networkSpec.relaychain.chain}.json`;
      await client.copyFileFromPod(
        identifier,
        `/cfg/${fileName}`,
        `${tempDir.path}/${fileName}`
      );
      await client.copyFileToPod(
        identifier,
        localMagicFilepath,
        FINISH_MAGIC_FILE
      );
    }

    // Create nodes
    for (const node of networkSpec.relaychain.nodes) {
      // TODO: k8s don't see pods by name so in here we inject the bootnode ip
      const bootnodeIP = await client.getBootnodeIP();
      node.bootnodes = [
        `/dns/${bootnodeIP}/tcp/30333/p2p/${DEFAULT_BOOTNODE_PEER_ID}`,
      ];
      // create the node and attach to the network object
      const podDef = await genPodDef(client, node);
      await client.crateResource(podDef, true, true);

      const identifier = `${podDef.kind}/${podDef.metadata.name}`;
      const fwdPort = await startPortForwarding(9944, identifier, client);
      const prometheusPort = await startPortForwarding(
        PROMETHEUS_PORT,
        identifier,
        client
      );
      const wsUri = `ws://127.0.0.1:${fwdPort}`;
      const prometheusUri = `http://127.0.0.1:${prometheusPort}/metrics`;

      const networkNode: NetworkNode = new NetworkNode(
        node.name,
        wsUri,
        prometheusUri,
        node.autoConnectApi
      );
      network.addNode(networkNode);
    }

    debug("\t All relay chain nodes spawned...");
    // sleep 2 secs before connect the api
    await sleep(3000);

    for (const node of network.nodes) {
      if (node.autoConnectApi) await node.connectApi();
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
          name: getUniqueName("temp"),
          validator: false,
          image: parachain.collator.image || DEFAULT_COLLATOR_IMAGE,
          commandWithArgs: commands.join(" && "),
          chain: networkSpec.relaychain.chain,
          bootnodes: [],
          args: [],
          env: [],
          autoConnectApi: false,
          telemetryUrl: "",
        };
        const podDef = await genPodDef(client, node);
        await client.crateResource(podDef, true, true);
        const identifier = `${podDef.metadata.name}`;
        if (parachain.genesisStateGenerator) {
          stateLocalFilePath = `${tempDir.path}/${GENESIS_STATE_FILENAME}`;
          await client.copyFileFromPod(
            identifier,
            `/cfg/${GENESIS_STATE_FILENAME}`,
            stateLocalFilePath
          );
        }

        if (parachain.genesisWasmGenerator) {
          wasmLocalFilePath = `${tempDir.path}/${GENESIS_WASM_FILENAME}`;
          await client.copyFileFromPod(
            identifier,
            `/cfg/${GENESIS_STATE_FILENAME}`,
            wasmLocalFilePath
          );
        }

        // put file to terminate pod
        await client.copyFileToPod(
          identifier,
          localMagicFilepath,
          FINISH_MAGIC_FILE
        );
      }

      if (!stateLocalFilePath) stateLocalFilePath = parachain.genesisStatePath;
      if (!wasmLocalFilePath) wasmLocalFilePath = parachain.genesisWasmPath;

      // CHEKC
      if (!stateLocalFilePath || !wasmLocalFilePath)
        throw new Error("Invalid state or wasm files");

      // register parachain
      await network.registerParachain(
        parachain.id,
        wasmLocalFilePath,
        stateLocalFilePath
      );

      let finalCommandWithArgs =
        parachain.collator.commandWithArgs || parachain.collator.command;

      // create collator
      let collator: Node = {
        name: getUniqueName(parachain.collator.name),
        validator: false,
        image: parachain.collator.image,
        commandWithArgs:
          WAIT_UNTIL_SCRIPT_SUFIX + " && " + finalCommandWithArgs,
        chain: networkSpec.relaychain.chain,
        bootnodes: [],
        args: [],
        env: [],
        autoConnectApi: false,
        telemetryUrl: "",
      };
      const podDef = await genPodDef(client, collator);
      await client.crateResource(podDef, true, true);
      await sleep(1000);
      const identifier = `${podDef.metadata.name}`;
      const fileName = `${networkSpec.relaychain.chain}.json`;
      await client.copyFileToPod(
        identifier,
        `${tempDir.path}/${fileName}`,
        `/cfg/${fileName}`
      );
      await client.copyFileToPod(
        identifier,
        localMagicFilepath,
        FINISH_MAGIC_FILE
      );

      // TODO: do we need to connect to the collector node?
      // const identifier = `${podDef.kind}/${podDef.metadata.name}`;
      // const fwdPort = await startPortForwarding(9944, identifier, namespace);
      // const wsUri =  `ws://127.0.0.1:${fwdPort}`; //TODO: change address
      // const provider = new WsProvider(wsUri);
      // const api = await ApiPromise.create({ provider });

      // const networkNode: NetworkNode = {
      //   name: collator.name,
      //   apiInstance: api,
      //   wsUri
      // };

      // network.addNode(networkNode);
    }

    // console.log(network);
    // prevent global timeout
    network.launched = true;
    debug("\t 🚀 LAUNCH COMPLETE 🚀");
    return network;
  } catch (error) {
    console.error(error);
    if (network) await network.stop();
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
    if (network) await network.stop();
  }
}
