import { Providers } from "./providers/";
import { LaunchConfig, ComputedNetwork, Node, fileMap } from "./types";
import {
  generateNetworkSpec,
  generateBootnodeSpec,
  zombieWrapperPath,
  getUniqueName,
} from "./configManager";
import {
  GENESIS_STATE_FILENAME,
  GENESIS_WASM_FILENAME,
  PROMETHEUS_PORT,
  WS_URI_PATTERN,
  METRICS_URI_PATTERN,
  ZOMBIE_WRAPPER,
  LOKI_URL_FOR_NODE,
  RPC_WS_PORT,
  RPC_HTTP_PORT,
  LOCALHOST,
} from "./constants";
import { Network, Scope } from "./network";
import { NetworkNode } from "./networkNode";
import {
  clearAuthorities,
  addAuthority,
  changeGenesisConfig,
  addParachainToGenesis,
  addHrmpChannelsToGenesis,
  addBootNodes,
} from "./chain-spec";
import {
  generateNamespace,
  sleep,
  filterConsole,
  loadTypeDef,
  getSha256,
  series,
} from "./utils";
import tmp from "tmp-promise";
import fs from "fs";
import { generateParachainFiles } from "./paras";
import { decorators } from "./colors";
import { generateBootnodeString } from "./bootnode";
import { generateKeystoreFiles } from "./keys";
import path from "path";

const debug = require("debug")("zombie");

// Hide some warning messages that are coming from Polkadot JS API.
// TODO: Make configurable.
filterConsole([
  `code: '1006' reason: 'connection failed'`,
  `API-WS: disconnected`,
]);

export interface orchestratorOptions {
  monitor?: boolean;
  spawnConcurrency?: number;
  inCI?: boolean;
}

export async function start(
  credentials: string,
  networkConfig: LaunchConfig,
  options?: orchestratorOptions
) {
  const opts = {
    ...{ monitor: false, spawnConcurrency: 1, inCI: false },
    ...options,
  };

  debug("options", options);
  debug("opts", opts);

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

    // Define chain name and file name to use.
    const chainSpecFileName = `${networkSpec.relaychain.chain}.json`;
    const chainName = networkSpec.relaychain.chain;
    const chainSpecFullPath = `${tmpDir.path}/${chainSpecFileName}`;
    const chainSpecFullPathPlain = chainSpecFullPath.replace(
      ".json",
      "-plain.json"
    );

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
    const endpointPort =
      client.providerName === "native" ? RPC_WS_PORT : RPC_HTTP_PORT;
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
    await fs.promises.writeFile(
      zombieWrapperLocalPath,
      zombieWrapperContent
        .toString()
        .replace("{{REMOTE_DIR}}", client.remoteDir),
      {
        mode: 0o755,
      }
    );

    // create namespace
    await client.createNamespace();

    // setup cleaner
    if (!opts.monitor) {
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

    // Check if the chain spec is in raw format
    // Could be if the chain_spec_path was set
    const chainSpecContent = require(chainSpecFullPathPlain);
    client.chainId = chainSpecContent.id;

    if (!chainSpecContent.genesis.raw) {
      // Chain spec customization logic
      clearAuthorities(chainSpecFullPathPlain);
      for (const node of networkSpec.relaychain.nodes) {
        await addAuthority(chainSpecFullPathPlain, node.name, node.accounts!);
      }

      if (networkSpec.relaychain.genesis) {
        await changeGenesisConfig(
          chainSpecFullPathPlain,
          networkSpec.relaychain.genesis
        );
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

      if (networkSpec.hrmpChannels) {
        await addHrmpChannelsToGenesis(
          chainSpecFullPathPlain,
          networkSpec.hrmpChannels
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
    } else {
      console.log(
        `\n\t\t 🚧 ${decorators.yellow(
          "Chain Spec was set to a file in raw format, can't customize."
        )} 🚧`
      );
      await fs.promises.copyFile(chainSpecFullPathPlain, chainSpecFullPath);
    }

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

    // clear bootnodes
    await addBootNodes(chainSpecFullPath, []);

    // store the chain spec path to use in tests
    network.chainSpecFullPath = chainSpecFullPath;

    // files to include in each node
    const filesToCopyToNodes: fileMap[] = [
      {
        localFilePath: chainSpecFullPath,
        remoteFilePath: `${client.remoteDir}/${chainSpecFileName}`,
      },
      {
        localFilePath: zombieWrapperLocalPath,
        remoteFilePath: `${client.remoteDir}/${ZOMBIE_WRAPPER}`,
      },
    ];

    let bootnodes: string[] = [];

    if (networkConfig.settings.bootnode) {
      const bootnodeSpec = await generateBootnodeSpec(networkSpec);
      networkSpec.relaychain.nodes.unshift(bootnodeSpec);
    }

    const monitorIsAvailable = await client.isPodMonitorAvailable();

    const spawnNode = async (node: Node, network: Network) => {
      node.bootnodes = node.bootnodes.concat(bootnodes);

      debug(`creating node: ${node.name}`);
      const podDef = await (node.name === "bootnode"
        ? genBootnodeDef(namespace, node)
        : genNodeDef(namespace, node));

      let finalFilesToCopyToNode = [...filesToCopyToNodes];
      for (const override of node.overrides) {
        finalFilesToCopyToNode.push({
          localFilePath: override.local_path,
          remoteFilePath: `${client.remoteDir}/${override.remote_name}`,
        });
      }

      let keystoreLocalDir;
      if (node.name !== "bootnode") {
        // check if the node directory exists if not create (e.g for k8s provider)
        const nodeFilesPath = `${tmpDir.path}/${node.name}`;
        if (!fs.existsSync(nodeFilesPath)) {
          await fs.promises.mkdir(nodeFilesPath, { recursive: true });
        }

        const keystoreFiles = await generateKeystoreFiles(
          node,
          `${tmpDir.path}/${node.name}`
        );
        keystoreLocalDir = path.dirname(keystoreFiles[0]);
      }
      await client.spawnFromDef(
        podDef,
        finalFilesToCopyToNode,
        keystoreLocalDir
      );

      if (node.addToBootnodes) {
        // add first node as bootnode
        const [nodeIp, nodePort] = await client.getNodeInfo(
          podDef.metadata.name
        );
        bootnodes.push(
          await generateBootnodeString(node.key!, nodeIp, nodePort)
        );
        // add bootnodes to chain spec
        await addBootNodes(chainSpecFullPath, bootnodes);
        // flush require cache since we change the chain-spec
        delete require.cache[require.resolve(chainSpecFullPath)];
      }

      let networkNode: NetworkNode;
      if (options?.inCI) {
        const nodeIp = await client.getNodeIP(podDef.metadata.name);
        networkNode = new NetworkNode(
          node.name,
          WS_URI_PATTERN.replace("{{IP}}", nodeIp).replace(
            "{{PORT}}",
            RPC_HTTP_PORT.toString()
          ),
          METRICS_URI_PATTERN.replace("{{IP}}", nodeIp).replace(
            "{{PORT}}",
            PROMETHEUS_PORT.toString()
          ),
          userDefinedTypes
        );
      } else {
        const nodeIdentifier = `${podDef.kind}/${podDef.metadata.name}`;
        const fwdPort = await client.startPortForwarding(
          endpointPort,
          nodeIdentifier
        );
        const nodePrometheusPort = await client.startPortForwarding(
          PROMETHEUS_PORT,
          nodeIdentifier
        );

        networkNode = new NetworkNode(
          node.name,
          WS_URI_PATTERN.replace("{{IP}}", LOCALHOST).replace(
            "{{PORT}}",
            fwdPort.toString()
          ),
          METRICS_URI_PATTERN.replace("{{IP}}", LOCALHOST).replace(
            "{{PORT}}",
            nodePrometheusPort.toString()
          ),
          userDefinedTypes
        );
      }

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
            console.log(
              `\n\t\t\t tail -f  ${client.tmpDir}/${podDef.metadata.name}.log`
            );
            break;
        }
      }
    };

    const firstNode = networkSpec.relaychain.nodes.shift();
    if (firstNode) {
      await spawnNode(firstNode, network);
      await sleep(2000);

      const [nodeIp, nodePort] = await client.getNodeInfo(firstNode.name);

      bootnodes.push(
        await generateBootnodeString(firstNode.key!, nodeIp, nodePort)
      );
      // add bootnodes to chain spec
      await addBootNodes(chainSpecFullPath, bootnodes);
      // flush require cache since we change the chain-spec
      delete require.cache[require.resolve(chainSpecFullPath)];
    }

    const promiseGenerators = networkSpec.relaychain.nodes.map((node: Node) => {
      return () => spawnNode(node, network!);
    });

    await series(promiseGenerators, opts.spawnConcurrency);

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

      for(let i = 0; i < parachain.collator.count!; i++ ) {
        // create collator
        const collatorName = getUniqueName(parachain.collator.name);
        let collator: Node = {
          name: collatorName,
          key: getSha256(collatorName),
          validator: false,
          image: parachain.collator.image,
          command: parachain.collator.command,
          commandWithArgs: parachain.collator.commandWithArgs,
          chain: networkSpec.relaychain.chain,
          args: [...parachain.collator.args],
          bootnodes: bootnodes,
          env: parachain.collator.env,
          telemetryUrl: "",
          overrides: [],
          zombieRole: "collator",
          parachainId: parachain.id,
        };
        const podDef = await genNodeDef(namespace, collator);
        const filesToCopyToCollator = [];
        if(parachain.collator.command.includes("polkadot-collator")) {
          filesToCopyToCollator.push({
            localFilePath: `${tmpDir.path}/${chainName}-${parachain.id}.json`,
            remoteFilePath: `${client.remoteDir}/${chainName}-${parachain.id}.json`,
          });
        }

        await client.spawnFromDef(podDef, [...filesToCopyToNodes, ...filesToCopyToCollator]);

        let networkNode: NetworkNode;
        if (options?.inCI) {
          const nodeIp = await client.getNodeIP(podDef.metadata.name);
          networkNode = new NetworkNode(
            podDef.metadata.name,
            WS_URI_PATTERN.replace("{{IP}}", nodeIp).replace(
              "{{PORT}}",
              RPC_HTTP_PORT.toString()
            ),
            METRICS_URI_PATTERN.replace("{{IP}}", nodeIp).replace(
              "{{PORT}}",
              PROMETHEUS_PORT.toString()
            ),
            userDefinedTypes
          );
        } else {
          const nodeIdentifier = `${podDef.kind}/${podDef.metadata.name}`;
          const rpcPort = await client.startPortForwarding(
            endpointPort,
            nodeIdentifier
          );

          networkNode = new NetworkNode(
            podDef.metadata.name,
            WS_URI_PATTERN.replace("{{IP}}", LOCALHOST).replace(
              "{{PORT}}",
              rpcPort.toString()
            ),
            "" // TODO: needs to connect for metrics?
          );
        }

        networkNode.parachainId = parachain.id;
        network.addNode(networkNode, Scope.PARA);
      }
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
