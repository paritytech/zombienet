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
  DEFAULT_CHAIN_SPEC_PATH,
  DEFAULT_CHAIN_SPEC_RAW_PATH,
  DEFAULT_CHAIN_SPEC_COMMAND,
  zombieWrapperPath,
  ZOMBIE_WRAPPER,
} from "./configManager";
import { Network } from "./network";
import { NetworkNode } from "./networkNode";
import { startPortForwarding } from "./portForwarder";
//import { ApiPromise, WsProvider } from "@polkadot/api";
import { clearAuthorities, addAuthority, changeGenesisConfig, addParachainToGenesis } from "./chain-spec";
import {
  generateNamespace,
  sleep,
  filterConsole,
  writeLocalJsonFile,
  loadTypeDef,
  createTempNodeDef,
} from "./utils";
import tmp from "tmp-promise";
import fs from "fs";
import path, { resolve } from "path";
import { generateParachainFiles } from "./paras";
import { setupChainSpec } from "./providers/k8s";
import { getChainSpecRaw } from "./providers/k8s/chain-spec";

const debug = require("debug")("zombie");

// For now the only provider is k8s
const { genBootnodeDef, genPodDef, initClient } = Providers.Kubernetes;

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
) {
  let network: Network | undefined;
  let cronInterval = undefined;
  try {
    // Parse and build Network definition
    const networkSpec: ComputedNetwork = await generateNetworkSpec(networkConfig);
    debug(JSON.stringify(networkSpec, null, 4));

    // global timeout to spin the network
    setTimeout(() => {
      if (network && !network.launched) {
        throw new Error(
          `GLOBAL TIMEOUT (${networkSpec.settings.timeout} secs) `
        );
      }
    }, networkSpec.settings.timeout * 1000);

    // set namespace
    const namespace = `zombie-${generateNamespace()}`;

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

    const zombieWrapperLocalPath = `${tmpDir.path}/${ZOMBIE_WRAPPER}`;
    const zombieWrapperContent = await fs.promises.readFile(zombieWrapperPath);
    await fs.promises.writeFile(zombieWrapperLocalPath, zombieWrapperContent, {mode: 0o755 });

    // Define chain name and file name to use.
    const chainSpecFileName = `${networkSpec.relaychain.chain}.json`;
    const chainName = networkSpec.relaychain.chain;
    const chainSpecFullPath = `${tmpDir.path}/${chainSpecFileName}`;

    // create namespace
    await client.createNamespace();

    // Create bootnode and backchannel services
    debug(`Creating bootnode and backchannel services`);
    await client.createStaticResource("bootnode-service.yaml");
    await client.createStaticResource("backchannel-service.yaml");
    await client.createStaticResource("backchannel-pod.yaml");

    // create basic infra metrics if needed
    // if (withMetrics) await client.staticSetup();
    await client.createPodMonitor("pod-monitor.yaml", chainName);

    // setup cleaner
    if (!monitor) cronInterval = await client.setupCleaner();

    // create or copy chain spec
    await setupChainSpec(namespace, networkSpec, chainName, chainSpecFullPath);

    // check if we have the chain spec file
    if (!fs.existsSync(chainSpecFullPath))
      throw new Error("Can't find chain spec file!");

    // Chain spec customization logic
    clearAuthorities(chainSpecFullPath);
    for (const node of networkSpec.relaychain.nodes) {
      await addAuthority(chainSpecFullPath, node.name);
    }

    for(const parachain of networkSpec.parachains) {
      const parachainFilesPath = await generateParachainFiles(namespace, tmpDir.path, chainName,parachain);
      const stateLocalFilePath = `${parachainFilesPath}/${GENESIS_STATE_FILENAME}`;
      const wasmLocalFilePath = `${parachainFilesPath}/${GENESIS_WASM_FILENAME}`;
      if(parachain.addToGenesis) await addParachainToGenesis(chainSpecFullPath, parachain.id.toString(), stateLocalFilePath, wasmLocalFilePath);
    }

    // generate the raw chain spec
    await getChainSpecRaw(namespace, networkSpec.relaychain.defaultImage, chainName, chainSpecFullPath);

    // ensure chain raw is ok
    try {
      const chainRawContent = require(chainSpecFullPath);
      debug(`Chain name: ${chainRawContent.name}`);
    } catch(err) {
      throw new Error(`Error: chain-spec raw file at ${chainSpecFullPath} is not a valid JSON`);
    }

    // files to include in each node
    const filesToCopyToNodes = [
      {
      localFilePath: `${tmpDir.path}/${chainSpecFileName}`,
      remoteFilePath: `/cfg/${chainSpecFileName}`
      }, {
        localFilePath: zombieWrapperLocalPath,
        remoteFilePath: `/cfg/${ZOMBIE_WRAPPER}`
      }
    ];

    // bootnode
    // TODO: allow to customize the bootnode
    const bootnodeSpec = await generateBootnodeSpec(networkSpec);
    const bootnodeDef = await genBootnodeDef(namespace, bootnodeSpec);

    await client.spawnFromDef(bootnodeDef, filesToCopyToNodes);
    // make sure the bootnode is up and available over DNS
    await sleep(5000);

    const bootnodeIdentifier = `${bootnodeDef.kind}/${bootnodeDef.metadata.name}`;
    const fwdPort = await startPortForwarding(9944, bootnodeIdentifier, client);
    const prometheusPort = await startPortForwarding(
      PROMETHEUS_PORT,
      bootnodeIdentifier,
      client
    );

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

      let finalFilesToCopyToNode = filesToCopyToNodes;
      for (const override of node.overrides) {
        finalFilesToCopyToNode.push({
          localFilePath: override.local_path,
          remoteFilePath: `/cfg/${override.remote_name}`
        });
      }
      await client.spawnFromDef(podDef, finalFilesToCopyToNode);

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
      if(!parachain.addToGenesis) {
        // register parachain on a running network
        await network.registerParachain(
          parachain.id,
          `${tmpDir.path}/${parachain.id}/${GENESIS_WASM_FILENAME}`,
          `${tmpDir.path}/${parachain.id}/${GENESIS_STATE_FILENAME}`
        );
      }

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
      await client.spawnFromDef(podDef, filesToCopyToNodes);

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