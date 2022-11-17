import {
  askQuestion,
  CreateLogTable,
  decorators,
  filterConsole,
  generateNamespace,
  getLokiUrl,
  getSha256,
  loadTypeDef,
  makeDir,
  series,
  sleep,
} from "@zombienet/utils";
import fs from "fs";
import path from "path";
import tmp from "tmp-promise";
import { generateBootnodeString } from "./bootnode";
import {
  addAuraAuthority,
  addAuthority,
  addBalances,
  addBootNodes,
  addGrandpaAuthority,
  addHrmpChannelsToGenesis,
  addParachainToGenesis,
  addStaking,
  changeGenesisConfig,
  clearAuthorities,
  generateNominators,
  getNodeKey,
  readAndParseChainSpec,
  specHaveSessionsKeys,
} from "./chain-spec";
import {
  generateBootnodeSpec,
  generateNetworkSpec,
  zombieWrapperPath,
} from "./configGenerator";
import {
  GENESIS_STATE_FILENAME,
  GENESIS_WASM_FILENAME,
  INTROSPECTOR_POD_NAME,
  INTROSPECTOR_PORT,
  LOCALHOST,
  METRICS_URI_PATTERN,
  PROMETHEUS_PORT,
  RPC_HTTP_PORT,
  RPC_WS_PORT,
  TRACING_COLLATOR_NAMESPACE,
  TRACING_COLLATOR_PODNAME,
  TRACING_COLLATOR_PORT,
  TRACING_COLLATOR_SERVICE,
  WS_URI_PATTERN,
  ZOMBIE_WRAPPER,
} from "./constants";
import { registerParachain } from "./jsapi-helpers";
import { generateKeystoreFiles } from "./keys";
import { Network, Scope } from "./network";
import { NetworkNode } from "./networkNode";
import { generateParachainFiles } from "./paras";
import { Providers } from "./providers/";
import {
  ComputedNetwork,
  fileMap,
  LaunchConfig,
  MultiAddressByNode,
  Node,
  Parachain,
} from "./types";

const debug = require("debug")("zombie");

// Hide some warning messages that are coming from Polkadot JS API.
// TODO: Make configurable.
filterConsole([
  `code: '1006' reason: 'connection failed'`,
  `API-WS: disconnected`,
]);

export interface OrcOptionsInterface {
  monitor?: boolean;
  spawnConcurrency?: number;
  inCI?: boolean;
  dir?: string;
  force?: boolean;
}

export async function start(
  credentials: string,
  launchConfig: LaunchConfig,
  options?: OrcOptionsInterface,
) {
  const opts = {
    ...{ monitor: false, spawnConcurrency: 1, inCI: false },
    ...options,
  };

  let network: Network | undefined;
  let cronInterval = undefined;
  let multiAddressByNode: MultiAddressByNode = {};
  try {
    // Parse and build Network definition
    const networkSpec: ComputedNetwork = await generateNetworkSpec(
      launchConfig,
    );
    debug(JSON.stringify(networkSpec, null, 4));

    // global timeout to spin the network
    const timeoutTimer = setTimeout(() => {
      if (network && !network.launched) {
        throw new Error(
          `GLOBAL TIMEOUT (${networkSpec.settings.timeout} secs) `,
        );
      }
    }, networkSpec.settings.timeout * 1000);

    // set namespace
    const randomBytes = networkSpec.settings.provider === "podman" ? 4 : 16;
    const namespace = `zombie-${generateNamespace(randomBytes)}`;

    // get user defined types
    const userDefinedTypes: any = loadTypeDef(networkSpec.types);

    // use provided dir (and make some validations) or create tmp directory to store needed files
    const tmpDir = opts.dir
      ? { path: opts.dir }
      : await tmp.dir({ prefix: `${namespace}_` });

    // If custom path is provided then create it
    if (opts.dir) {
      if (!fs.existsSync(opts.dir)) {
        fs.mkdirSync(opts.dir);
      } else if (!opts.force) {
        const response = await askQuestion(
          `${decorators.yellow(
            "Directory already exists; \nDo you want to continue? (y/N)",
          )}`,
        );
        if (response.toLowerCase() !== "y") {
          console.log("Exiting...");
          process.exit(1);
        }
      }
    }

    const localMagicFilepath = `${tmpDir.path}/finished.txt`;

    // Define chain name and file name to use.
    const chainSpecFileName = `${networkSpec.relaychain.chain}.json`;
    const chainName = networkSpec.relaychain.chain;
    const chainSpecFullPath = `${tmpDir.path}/${chainSpecFileName}`;
    const chainSpecFullPathPlain = chainSpecFullPath.replace(
      ".json",
      "-plain.json",
    );

    // get provider fns
    const provider = networkSpec.settings.provider;
    if (!Providers.has(provider)) {
      throw new Error(
        "Invalid provider config. You must one of: " +
          Array.from(Providers.keys()).join(", "),
      );
    }

    const {
      genBootnodeDef,
      genNodeDef,
      initClient,
      setupChainSpec,
      getChainSpecRaw,
      replaceNetworkRef,
    } = Providers.get(networkSpec.settings.provider);

    const client = initClient(credentials, namespace, tmpDir.path);

    if (networkSpec.settings.node_spawn_timeout)
      client.timeout = networkSpec.settings.node_spawn_timeout;
    network = new Network(client, namespace, tmpDir.path);
    network.networkStartTime = new Date().getTime();

    const zombieTable = new CreateLogTable({
      head: [
        `${decorators.green("🧟 Zombienet 🧟")}`,
        `${decorators.green("Initiation")}`,
      ],
      colWidths: [20, 100],
      doubleBorder: true,
    });

    zombieTable.pushTo([
      [
        decorators.green("Provider"),
        decorators.red(networkSpec.settings.provider),
      ],
      [decorators.green("Namespace"), namespace],
      [decorators.green("Temp Dir"), tmpDir.path],
    ]);

    zombieTable.print();

    debug(`\t Launching network under namespace: ${namespace}`);

    // validate access to cluster
    const isValid = await client.validateAccess();
    if (!isValid) {
      console.error(
        `\n\t\t ${decorators.red("⚠ Can not access")} ${decorators.magenta(
          networkSpec.settings.provider,
        )}, please check your config.`,
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
      },
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
    await client.staticSetup(networkSpec.settings);
    await client.createPodMonitor("pod-monitor.yaml", chainName);

    // create or copy chain spec
    await setupChainSpec(
      namespace,
      networkSpec.relaychain,
      chainName,
      chainSpecFullPathPlain,
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
      const relayChainSpec = readAndParseChainSpec(chainSpecFullPathPlain);
      const keyType = specHaveSessionsKeys(relayChainSpec) ? "session" : "aura";

      // Clear all defaults
      clearAuthorities(chainSpecFullPathPlain);

      // add balances for nodes
      await addBalances(chainSpecFullPathPlain, networkSpec.relaychain.nodes);

      // add authorities for nodes
      const validatorKeys = [];
      for (const node of networkSpec.relaychain.nodes) {
        if (node.validator) {
          validatorKeys.push(node.accounts.sr_stash.address);

          if (keyType === "session") {
            const key = getNodeKey(node);
            await addAuthority(chainSpecFullPathPlain, node, key);
          } else {
            await addAuraAuthority(
              chainSpecFullPathPlain,
              node.name,
              node.accounts!,
            );
            await addGrandpaAuthority(
              chainSpecFullPathPlain,
              node.name,
              node.accounts!,
            );
          }

          await addStaking(chainSpecFullPathPlain, node);
        }
      }

      if (networkSpec.relaychain.randomNominatorsCount) {
        await generateNominators(
          chainSpecFullPathPlain,
          networkSpec.relaychain.randomNominatorsCount,
          networkSpec.relaychain.maxNominations,
          validatorKeys,
        );
      }

      if (networkSpec.relaychain.genesis) {
        await changeGenesisConfig(
          chainSpecFullPathPlain,
          networkSpec.relaychain.genesis,
        );
      }

      const parachainFilesPromiseGenerator = async (parachain: Parachain) => {
        const parachainFilesPath = `${tmpDir.path}/${parachain.name}`;
        await makeDir(parachainFilesPath);
        await generateParachainFiles(
          namespace,
          tmpDir.path,
          parachainFilesPath,
          chainName,
          parachain,
        );
      };
      const parachainPromiseGenerators = networkSpec.parachains.map(
        (parachain: Parachain) => {
          return () => parachainFilesPromiseGenerator(parachain);
        },
      );

      await series(parachainPromiseGenerators, opts.spawnConcurrency);
      for (const parachain of networkSpec.parachains) {
        const parachainFilesPath = `${tmpDir.path}/${parachain.name}`;
        const stateLocalFilePath = `${parachainFilesPath}/${GENESIS_STATE_FILENAME}`;
        const wasmLocalFilePath = `${parachainFilesPath}/${GENESIS_WASM_FILENAME}`;
        if (parachain.addToGenesis)
          await addParachainToGenesis(
            chainSpecFullPathPlain,
            parachain.id.toString(),
            stateLocalFilePath,
            wasmLocalFilePath,
          );
      }

      if (networkSpec.hrmp_channels) {
        await addHrmpChannelsToGenesis(
          chainSpecFullPathPlain,
          networkSpec.hrmp_channels,
        );
      }

      // generate the raw chain spec
      await getChainSpecRaw(
        namespace,
        networkSpec.relaychain.defaultImage,
        chainName,
        networkSpec.relaychain.defaultCommand,
        chainSpecFullPath,
      );
    } else {
      console.log(
        `\n\t\t 🚧 ${decorators.yellow(
          "Chain Spec was set to a file in raw format, can't customize.",
        )} 🚧`,
      );
      await fs.promises.copyFile(chainSpecFullPathPlain, chainSpecFullPath);
    }

    // ensure chain raw is ok
    try {
      const chainRawContent = require(chainSpecFullPath);
      debug(`Chain name: ${chainRawContent.name}`);

      new CreateLogTable({ colWidths: [120], doubleBorder: true }).pushToPrint([
        [`Chain name: ${decorators.green(chainRawContent.name)}`],
      ]);
    } catch (err) {
      throw new Error(
        `Error: chain-spec raw file at ${chainSpecFullPath} is not a valid JSON`,
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

    if (launchConfig.settings.bootnode) {
      const bootnodeSpec = await generateBootnodeSpec(networkSpec);
      networkSpec.relaychain.nodes.unshift(bootnodeSpec);
    }

    const monitorIsAvailable = await client.isPodMonitorAvailable();
    let jaegerUrl: string;
    if (
      client.providerName === "podman" &&
      networkSpec.settings.enable_tracing
    ) {
      const jaegerIp = await client.getNodeIP("tempo");
      jaegerUrl = `${jaegerIp}:6831`;
    } else if (
      client.providerName === "kubernetes" &&
      networkSpec.settings.enable_tracing === true
    ) {
      // default to sidecar
      jaegerUrl = "localhost:6831";
      // try to get the jaegerUrl from config or process env
      if (networkSpec.settings.jaeger_agent)
        jaegerUrl = networkSpec.settings.jaeger_agent;
      // override with env
      if (process.env.ZOMBIE_JAEGER_URL)
        jaegerUrl = process.env.ZOMBIE_JAEGER_URL;
    }

    const spawnNode = async (
      node: Node,
      network: Network,
      paraId?: number,
      parachainSpecPath?: string,
      parachain?: Parachain,
    ) => {
      let parachainSpecId;
      // for relay chain we can have more than one bootnode.
      if (node.zombieRole === "node" || node.zombieRole === "collator")
        node.bootnodes = node.bootnodes.concat(bootnodes);

      if (jaegerUrl) node.jaegerUrl = jaegerUrl;

      debug(`creating node: ${node.name}`);
      const podDef = await (node.name === "bootnode"
        ? genBootnodeDef(namespace, node)
        : genNodeDef(namespace, node));

      let finalFilesToCopyToNode = [...filesToCopyToNodes];

      // add spec file if is provided
      if (parachainSpecPath) {
        finalFilesToCopyToNode.push({
          localFilePath: parachainSpecPath,
          remoteFilePath: `${client.remoteDir}/${node.chain}-${paraId}.json`,
        });
        const parachainSpec = require(parachainSpecPath);
        parachainSpecId = parachainSpec.id;
      }
      for (const override of node.overrides) {
        finalFilesToCopyToNode.push({
          localFilePath: override.local_path,
          remoteFilePath: `${client.remoteDir}/${override.remote_name}`,
        });
      }

      let keystoreLocalDir;
      if (node.accounts) {
        // check if the node directory exists if not create (e.g for k8s provider)
        let nodeFilesPath = tmpDir.path;
        if (parachain && parachain.name) nodeFilesPath += `/${parachain.name}`;
        nodeFilesPath += `/${node.name}`;

        await makeDir(nodeFilesPath, true);

        const isStatemint = parachain && parachain.chain?.includes("statemint");
        const keystoreFiles = await generateKeystoreFiles(
          node,
          nodeFilesPath,
          isStatemint,
        );
        keystoreLocalDir = path.dirname(keystoreFiles[0]);
      }

      // replace all network references in command
      replaceNetworkRef(podDef, network);

      await client.spawnFromDef(
        podDef,
        finalFilesToCopyToNode,
        keystoreLocalDir,
        parachainSpecId || client.chainId,
      );

      const [nodeIp, nodePort] = await client.getNodeInfo(podDef.metadata.name);
      const nodeMultiAddress = await generateBootnodeString(
        node.key!,
        nodeIp,
        nodePort,
      );
      multiAddressByNode[podDef.metadata.name] = nodeMultiAddress;

      if (node.addToBootnodes) {
        bootnodes.push(nodeMultiAddress);
        await addBootNodes(chainSpecFullPath, bootnodes);
        // flush require cache since we change the chain-spec
        delete require.cache[require.resolve(chainSpecFullPath)];
      }

      let networkNode: NetworkNode;

      const endpointPort = RPC_WS_PORT;
      if (options?.inCI) {
        const nodeIp = await client.getNodeIP(podDef.metadata.name);
        networkNode = new NetworkNode(
          node.name,
          WS_URI_PATTERN.replace("{{IP}}", nodeIp).replace(
            "{{PORT}}",
            endpointPort.toString(),
          ),
          METRICS_URI_PATTERN.replace("{{IP}}", nodeIp).replace(
            "{{PORT}}",
            PROMETHEUS_PORT.toString(),
          ),
          nodeMultiAddress,
          userDefinedTypes,
        );
      } else {
        const nodeIdentifier = `${podDef.kind}/${podDef.metadata.name}`;
        const fwdPort = await client.startPortForwarding(
          endpointPort,
          nodeIdentifier,
        );
        const nodePrometheusPort = await client.startPortForwarding(
          PROMETHEUS_PORT,
          nodeIdentifier,
        );

        const listeningIp = networkSpec.settings.local_ip || LOCALHOST;

        networkNode = new NetworkNode(
          node.name,
          WS_URI_PATTERN.replace("{{IP}}", listeningIp).replace(
            "{{PORT}}",
            fwdPort.toString(),
          ),
          METRICS_URI_PATTERN.replace("{{IP}}", listeningIp).replace(
            "{{PORT}}",
            nodePrometheusPort.toString(),
          ),
          nodeMultiAddress,
          userDefinedTypes,
        );
      }

      networkNode.group = node.group;

      if (paraId) {
        if (!network.paras[paraId])
          network.addPara(
            paraId,
            parachainSpecPath,
            parachain?.wasmPath,
            parachain?.statePath,
          );
        networkNode.parachainId = paraId;
        network.addNode(networkNode, Scope.PARA);
      } else {
        network.addNode(networkNode, Scope.RELAY);
      }

      // Display info about the current node
      let logTable = new CreateLogTable({
        colWidths: [20, 100],
        doubleBorder: true,
      });
      logTable.pushTo([
        ["Pod", decorators.green(node.name)],
        ["Status", decorators.green("Running")],
      ]);
      if (node.overrides && node.overrides.length > 0) {
        logTable.pushTo([
          [
            {
              colSpan: 2,
              content: `with ${decorators.yellow("Overrides")}...`,
            },
          ],
        ]);

        for (const override of node.overrides) {
          logTable.pushTo([
            ["local_path", override.local_path],
            ["remote name", override.remote_name],
          ]);
        }
      }
      if (monitorIsAvailable) {
        const loki_url = getLokiUrl(
          namespace,
          podDef.metadata.name,
          network.networkStartTime!,
        );
        logTable.pushTo([
          [decorators.green("Grafana logs url"), decorators.magenta(loki_url)],
        ]);
      } else {
        logTable.pushTo([
          [
            {
              colSpan: 2,
              content: decorators.magenta(
                "You can follow the logs of the node by running this command: ",
              ),
            },
          ],
        ]);
        let logCommand;
        switch (networkSpec.settings.provider) {
          case "podman":
            logCommand = `podman logs -f ${podDef.metadata.name}_pod-${podDef.metadata.name}`;
            break;
          case "kubernetes":
            logCommand = `kubectl logs -f ${podDef.metadata.name} -c ${podDef.metadata.name} -n ${namespace}`;
            break;
          case "native":
            logCommand = `tail -f  ${client.tmpDir}/${podDef.metadata.name}.log`;
            break;
        }
        logTable.print();
        console.log(logCommand + "\n\n");
      }
    };

    const firstNode = networkSpec.relaychain.nodes.shift();
    if (firstNode) {
      await spawnNode(firstNode, network);
      await sleep(2000);

      const [nodeIp, nodePort] = await client.getNodeInfo(firstNode.name);

      bootnodes.push(
        await generateBootnodeString(firstNode.key!, nodeIp, nodePort),
      );
      // add bootnodes to chain spec
      await addBootNodes(chainSpecFullPath, bootnodes);
      // flush require cache since we change the chain-spec
      delete require.cache[require.resolve(chainSpecFullPath)];

      if (client.providerName === "kubernetes") {
        // cache the chainSpec with bootnodes
        const fileBuffer = await fs.promises.readFile(chainSpecFullPath);
        const fileHash = getSha256(fileBuffer.toString());
        const parts = chainSpecFullPath.split("/");
        const fileName = parts[parts.length - 1];
        await client.uploadToFileserver(chainSpecFullPath, fileName, fileHash);
      }
    }

    const promiseGenerators = networkSpec.relaychain.nodes.map((node: Node) => {
      return () => spawnNode(node, network!);
    });

    await series(promiseGenerators, opts.spawnConcurrency);

    console.log("\t All relay chain nodes spawned...");
    debug("\t All relay chain nodes spawned...");

    const collatorPromiseGenerators = [];
    for (const parachain of networkSpec.parachains) {
      if (!parachain.addToGenesis && parachain.registerPara) {
        // register parachain on a running network
        await registerParachain(
          parachain.id,
          `${tmpDir.path}/${parachain.name}/${GENESIS_WASM_FILENAME}`,
          `${tmpDir.path}/${parachain.name}/${GENESIS_STATE_FILENAME}`,
          network.relay[0].wsUri,
        );
      }

      if (parachain.cumulusBased) {
        const firstCollatorNode = parachain.collators.shift();
        if (firstCollatorNode) {
          await spawnNode(
            firstCollatorNode,
            network,
            parachain.id,
            parachain.specPath,
            parachain,
          );
          await sleep(2000);

          const [nodeIp, nodePort] = await client.getNodeInfo(
            firstCollatorNode.name,
          );
          // add bootnodes to chain spec
          await addBootNodes(parachain.specPath!, [
            await generateBootnodeString(
              firstCollatorNode.key!,
              nodeIp,
              nodePort,
            ),
          ]);
          // flush require cache since we change the chain-spec
          delete require.cache[require.resolve(parachain.specPath!)];
        }
      }

      collatorPromiseGenerators.push(
        ...parachain.collators.map((node: Node) => {
          return () =>
            spawnNode(
              node,
              network!,
              parachain.id,
              parachain.specPath,
              parachain,
            );
        }),
      );
    }

    // launch all collator in series
    await series(collatorPromiseGenerators, opts.spawnConcurrency);

    // check if polkadot-instrospector is enabled
    if (
      networkSpec.settings.polkadot_introspector &&
      ["podman", "kubernetes"].includes(networkSpec.settings.provider)
    ) {
      const firstNode = network.relay[0];
      const [nodeIp, port] = await client.getNodeInfo(
        firstNode.name,
        RPC_HTTP_PORT,
        true,
      );
      const wsUri = WS_URI_PATTERN.replace("{{IP}}", nodeIp).replace(
        "{{PORT}}",
        port,
      );
      await client.spawnIntrospector(wsUri);

      const IP = options?.inCI
        ? await client.getNodeIP(INTROSPECTOR_POD_NAME)
        : LOCALHOST;
      const PORT = options?.inCI
        ? INTROSPECTOR_PORT
        : await client.startPortForwarding(
            INTROSPECTOR_PORT,
            INTROSPECTOR_POD_NAME,
          );

      // TODO: create a new kind `companion`
      const introspectorNetworkNode = new NetworkNode(
        INTROSPECTOR_POD_NAME,
        "",
        METRICS_URI_PATTERN.replace("{{IP}}", IP).replace(
          "{{PORT}}",
          PORT.toString(),
        ),
        "",
      );

      network.addNode(introspectorNetworkNode, Scope.COMPANION);
    }

    // Add span collator if is available
    if (networkSpec.settings.tracing_collator_url) {
      network.tracing_collator_url = networkSpec.settings.tracing_collator_url;
    } else {
      const servicePort =
        networkSpec.settings.tracing_collator_service_port ||
        TRACING_COLLATOR_PORT;
      switch (networkSpec.settings.provider) {
        case "kubernetes":
          // check if we have the service available
          const serviceName =
            networkSpec.settings.tracing_collator_service_name ||
            TRACING_COLLATOR_SERVICE;
          const serviceNamespace =
            networkSpec.settings.tracing_collator_service_namespace ||
            TRACING_COLLATOR_NAMESPACE;
          // check if service exists
          let serviceExist;
          try {
            await client.runCommand([
              "get",
              "service",
              serviceName,
              "-n",
              serviceNamespace,
            ]);
            serviceExist = true;
          } catch (_) {
            console.log(
              decorators.yellow(
                `\n\t Warn: Tracing collator service doesn't exist`,
              ),
            );
          }

          if (serviceExist) {
            try {
              const tracingPort = await client.startPortForwarding(
                servicePort,
                `service/${serviceName}`,
                serviceNamespace,
              );
              network.tracing_collator_url = `http://localhost:${tracingPort}`;
            } catch (_) {
              console.log(
                decorators.yellow(
                  `\n\t Warn: Can not create the forwarding to the tracing collator`,
                ),
              );
            }
          }
          break;
        case "podman":
          const tracingPort = await client.getPortMapping(
            servicePort,
            TRACING_COLLATOR_PODNAME,
          );
          network.tracing_collator_url = `http://localhost:${tracingPort}`;
          break;
      }
    }

    // cleanup global timeout
    network.launched = true;
    clearTimeout(timeoutTimer);
    debug(
      `\t 🚀 LAUNCH COMPLETE under namespace ${decorators.green(namespace)} 🚀`,
    );

    await fs.promises.writeFile(
      `${tmpDir.path}/zombie.json`,
      JSON.stringify(network),
    );

    return network;
  } catch (error) {
    console.error(error);
    if (network) {
      await network.dumpLogs();
      await network.stop();
    }
    if (cronInterval) clearInterval(cronInterval);
    process.exit(1);
  }
}

export async function test(
  credentials: string,
  networkConfig: LaunchConfig,
  cb: (network: Network) => void,
) {
  let network: Network | undefined;
  try {
    network = await start(credentials, networkConfig, { force: true });
    await cb(network);
  } catch (error) {
    console.error(error);
  } finally {
    if (network) {
      await network.dumpLogs();
      await network.stop();
    }
  }
}
