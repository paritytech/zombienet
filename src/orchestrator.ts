import { Providers } from "./providers/";
import { LaunchConfig, ComputedNetwork, Node } from "./types";
import {
  generateNetworkSpec,
  generateBootnodeSpec,
  getUniqueName,
  GENESIS_STATE_FILENAME,
  GENESIS_WASM_FILENAME,
  PROMETHEUS_PORT,
  DEFAULT_BOOTNODE_PEER_ID,
  WS_URI_PATTERN,
  METRICS_URI_PATTERN,
  zombieWrapperPath,
  ZOMBIE_WRAPPER,
  LOKI_URL_FOR_NODE,
  RPC_WS_PORT,
  RPC_HTTP_PORT,
} from "./configManager";
import { Network, Scope } from "./network";
import { NetworkNode } from "./networkNode";
import {
  clearAuthorities,
  addAuthority,
  changeGenesisConfig,
  addParachainToGenesis,
} from "./chain-spec";
import { generateNamespace, sleep, filterConsole, loadTypeDef } from "./utils";
import tmp from "tmp-promise";
import fs from "fs";
import { generateParachainFiles } from "./paras";
import { decorators } from "./colors";

const debug = require("debug")("zombie");

// Hide some warning messages that are coming from Polkadot JS API.
// TODO: Make configurable.
filterConsole([
  `code: '1006' reason: 'connection failed'`,
  `API-WS: disconnected`,
]);

export async function start(
  credentials: string,
  networkConfig: LaunchConfig,
  monitor: boolean = false
) {
  let network: Network | undefined;
  let cronInterval = undefined;
  try {
    // Parse and build Network definition
    const networkSpec: ComputedNetwork = await generateNetworkSpec(
      networkConfig
    );
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
    const randomBytes = networkSpec.settings.provider === "podman" ? 4 : 16;
    const namespace = `zombie-${generateNamespace(randomBytes)}`;

    // get user defined types
    const userDefinedTypes: any = loadTypeDef(networkSpec.types);

    // create tmp directory to store needed files
    const tmpDir = await tmp.dir({ prefix: `${namespace}_` });
    const localMagicFilepath = `${tmpDir.path}/finished.txt`;

    // get provider fns
    const provider = networkSpec.settings.provider;
    if (!Providers.has(provider)) {
      throw new Error(
        "Invalid provider config. You must one of: " +
          Array.from(Providers.keys()).join(", ")
      );
    }
    console.log(
      `\n\t Using provider: ${decorators.magenta(
        networkSpec.settings.provider
      )}\n`
    );
    const {
      genBootnodeDef,
      genNodeDef,
      initClient,
      setupChainSpec,
      getChainSpecRaw,
    } = Providers.get(networkSpec.settings.provider);

    const client = initClient(credentials, namespace, tmpDir.path);
    const endpointPort = client.providerName === "native" ? RPC_WS_PORT : RPC_HTTP_PORT;
    network = new Network(client, namespace, tmpDir.path);

    console.log(
      `\t Launching network under namespace: ${decorators.magenta(namespace)}`
    );
    console.log(
      `\t\t Using temporary directory: ${decorators.magenta(tmpDir.path)}`
    );
    debug(`\t Launching network under namespace: ${namespace}`);

    // validate access to cluster
    const isValid = await client.validateAccess();
    if (!isValid) {
      console.error(
        `\n\t\t ${decorators.red("⚠ Can not access")} ${decorators.magenta(
          networkSpec.settings.provider
        )}, please check your config.`
      );
      process.exit(1);
    }

    // Create MAGIC file to stop temp/init containers
    fs.openSync(localMagicFilepath, "w");

    const zombieWrapperLocalPath = `${tmpDir.path}/${ZOMBIE_WRAPPER}`;
    const zombieWrapperContent = await fs.promises.readFile(zombieWrapperPath);
    await fs.promises.writeFile(zombieWrapperLocalPath, zombieWrapperContent.toString().replace("{{REMOTE_DIR}}", client.remoteDir), {
      mode: 0o755,
    });

    // Define chain name and file name to use.
    const chainSpecFileName = `${networkSpec.relaychain.chain}.json`;
    const chainSpecPlainFileName = chainSpecFileName.replace(
      ".json",
      "-plain.json"
    );
    const chainName = networkSpec.relaychain.chain;
    const chainSpecFullPath = `${tmpDir.path}/${chainSpecFileName}`;
    const chainSpecFullPathPlain = chainSpecFullPath.replace(
      ".json",
      "-plain.json"
    );

    // create namespace
    await client.createNamespace();

    // setup cleaner
    if (!monitor) {
      cronInterval = await client.setupCleaner();
      debug("Cleanner job configured");
    }

    // Create bootnode and backchannel services
    debug(`Creating static resources (bootnode and backchannel services)`);
    await client.staticSetup();
    await client.createPodMonitor("pod-monitor.yaml", chainName);

    // create or copy chain spec
    await setupChainSpec(
      namespace,
      networkSpec,
      chainName,
      chainSpecFullPathPlain
    );

    // check if we have the chain spec file
    if (!fs.existsSync(chainSpecFullPathPlain))
      throw new Error("Can't find chain spec file!");

    // Chain spec customization logic
    clearAuthorities(chainSpecFullPathPlain);
    for (const node of networkSpec.relaychain.nodes) {
      await addAuthority(chainSpecFullPathPlain, node.name);
    }

    for (const parachain of networkSpec.parachains) {
      const parachainFilesPath = await generateParachainFiles(
        namespace,
        tmpDir.path,
        chainName,
        parachain
      );
      const stateLocalFilePath = `${parachainFilesPath}/${GENESIS_STATE_FILENAME}`;
      const wasmLocalFilePath = `${parachainFilesPath}/${GENESIS_WASM_FILENAME}`;
      if (parachain.addToGenesis)
        await addParachainToGenesis(
          chainSpecFullPathPlain,
          parachain.id.toString(),
          stateLocalFilePath,
          wasmLocalFilePath
        );
    }

    // generate the raw chain spec
    await getChainSpecRaw(
      namespace,
      networkSpec.relaychain.defaultImage,
      chainName,
      networkSpec.relaychain.defaultCommand,
      chainSpecFullPath
    );

    // ensure chain raw is ok
    try {
      const chainRawContent = require(chainSpecFullPath);
      debug(`Chain name: ${chainRawContent.name}`);
      console.log(
        `\n\t\t Chain name: ${decorators.green(chainRawContent.name)}`
      );
    } catch (err) {
      throw new Error(
        `Error: chain-spec raw file at ${chainSpecFullPath} is not a valid JSON`
      );
    }

    // files to include in each node
    const filesToCopyToNodes = [
      {
        localFilePath: `${tmpDir.path}/${chainSpecFileName}`,
        remoteFilePath: `${client.remoteDir}/${chainSpecFileName}`,
      },
      {
        localFilePath: zombieWrapperLocalPath,
        remoteFilePath: `${client.remoteDir}/${ZOMBIE_WRAPPER}`,
      },
    ];

    // bootnode
    // TODO: allow to customize the bootnode
    const bootnodeSpec = await generateBootnodeSpec(networkSpec);
    const bootnodeDef = await genBootnodeDef(namespace, bootnodeSpec);

    await client.spawnFromDef(bootnodeDef, filesToCopyToNodes);
    // make sure the bootnode is up and available over DNS
    await sleep(2000);

    const bootnodeIdentifier = `${bootnodeDef.kind}/${bootnodeDef.metadata.name}`;
    const fwdPort = await client.startPortForwarding(endpointPort, bootnodeIdentifier);
    const prometheusPort = await client.startPortForwarding(
      PROMETHEUS_PORT,
      bootnodeIdentifier
    );

    const bootnodeNode: NetworkNode = new NetworkNode(
      bootnodeDef.metadata.name,
      WS_URI_PATTERN.replace("{{PORT}}", fwdPort.toString()),
      METRICS_URI_PATTERN.replace("{{PORT}}", prometheusPort.toString())
    );

    network.addNode(bootnodeNode, Scope.RELAY);

    const [bootnodeIP, bootnodePort] = await client.getBootnodeInfo(
      bootnodeDef.metadata.name
    );

    const monitorIsAvailable = await client.isPodMonitorAvailable();

    // Create nodes
    for (const node of networkSpec.relaychain.nodes) {
      // TODO: k8s don't see pods by name so in here we inject the bootnode ip
      bootnodePort;
      node.bootnodes = [
        `/dns/${bootnodeIP}/tcp/${bootnodePort}/p2p/${DEFAULT_BOOTNODE_PEER_ID}`,
      ];

      debug(`creating node: ${node.name}`);
      const podDef = await genNodeDef(namespace, node);

      let finalFilesToCopyToNode = filesToCopyToNodes;
      for (const override of node.overrides) {
        finalFilesToCopyToNode.push({
          localFilePath: override.local_path,
          remoteFilePath: `${client.remoteDir}/${override.remote_name}`,
        });
      }
      await client.spawnFromDef(podDef, finalFilesToCopyToNode);

      const nodeIdentifier = `${podDef.kind}/${podDef.metadata.name}`;
      const fwdPort = await client.startPortForwarding(endpointPort, nodeIdentifier);
      const nodePrometheusPort = await client.startPortForwarding(
        PROMETHEUS_PORT,
        nodeIdentifier
      );

      const networkNode: NetworkNode = new NetworkNode(
        node.name,
        WS_URI_PATTERN.replace("{{PORT}}", fwdPort.toString()),
        METRICS_URI_PATTERN.replace("{{PORT}}", nodePrometheusPort.toString()),
        userDefinedTypes
      );
      network.addNode(networkNode, Scope.RELAY);

      // Display info about the current node
      let msg = `\t${decorators.green(node.name)} running`;
      if (node.overrides && node.overrides.length > 0) {
        msg += `\n\t\t with ${decorators.yellow("Overrides")}...\n`;
        for (const override of node.overrides) {
          msg += `\t\t local_path: ${override.local_path}\n`;
          msg += `\t\t remote name: ${override.remote_name}`;
        }
      }

      console.log(msg);
      if (monitorIsAvailable) {
        const loki_url = LOKI_URL_FOR_NODE.replace(
          /{{namespace}}/,
          namespace
        ).replace(/{{podName}}/, podDef.metadata.name);
        console.log(`\t${decorators.green("Grafana logs url:")}`);
        console.log(`\t\t${decorators.magenta(loki_url)}`);
      } else {
        console.log(
          `\n\t\t ${decorators.magenta(
            "You can follow the logs of the node by running this command: "
          )}`
        );
        switch (networkSpec.settings.provider) {
          case "podman":
            console.log(
              `\n\t\t\t podman logs ${podDef.metadata.name}_pod-${podDef.metadata.name}`
            );
            break;
          case "kubernetes":
            console.log(`\n\t\t\t kubectl logs ${podDef.metadata.name}`);
            break;
          case "native":
           console.log(`\n\t\t\t tail -f  ${client.tmpDir}/${podDef.metadata.name}`);
            break;
        }
      }
    }

    console.log("\t All relay chain nodes spawned...");
    debug("\t All relay chain nodes spawned...");

    for (const parachain of networkSpec.parachains) {
      if (!parachain.addToGenesis) {
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
        commandWithArgs: parachain.collator.commandWithArgs,
        chain: networkSpec.relaychain.chain,
        bootnodes: [
          `/dns/${bootnodeIP}/tcp/${bootnodePort}/p2p/${DEFAULT_BOOTNODE_PEER_ID}`,
        ],
        args: [],
        env: parachain.collator.env,
        telemetryUrl: "",
        overrides: [],
        zombieRole: "collator"
      };
      const podDef = await genNodeDef(namespace, collator);
      await client.spawnFromDef(podDef, filesToCopyToNodes);

      const nodeIdentifier = `${podDef.kind}/${podDef.metadata.name}`;
      const rpcPort = await client.startPortForwarding(endpointPort, nodeIdentifier);

      const networkNode: NetworkNode = new NetworkNode(
        podDef.metadata.name,
        WS_URI_PATTERN.replace("{{PORT}}", rpcPort.toString()),
        "" // TODO: needs to connect for metrics?
      );

      networkNode.parachainId = parachain.id;
      network.addNode(networkNode, Scope.PARA);
    }

    // prevent global timeout
    network.launched = true;
    debug(
      `\t 🚀 LAUNCH COMPLETE under namespace ${decorators.green(namespace)} 🚀`
    );
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
