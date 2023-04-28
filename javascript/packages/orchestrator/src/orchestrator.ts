import {
  CreateLogTable,
  PARACHAIN_NOT_FOUND,
  POLKADOT_NOT_FOUND,
  POLKADOT_NOT_FOUND_DESCRIPTION,
  askQuestion,
  decorators,
  filterConsole,
  generateNamespace,
  getSha256,
  loadTypeDef,
  makeDir,
  series,
  setSilent,
  sleep,
} from "@zombienet/utils";
import fs from "fs";
import tmp from "tmp-promise";
import {
  addBootNodes,
  addParachainToGenesis,
  customizePlainRelayChain,
  readAndParseChainSpec,
} from "./chainSpec";
import {
  generateBootnodeSpec,
  generateNetworkSpec,
  zombieWrapperPath,
} from "./configGenerator";
import {
  GENESIS_STATE_FILENAME,
  GENESIS_WASM_FILENAME,
  TOKEN_PLACEHOLDER,
  ZOMBIE_WRAPPER,
} from "./constants";
import { registerParachain } from "./jsapi-helpers";
import { Network, Scope } from "./network";
import { generateParachainFiles } from "./paras";
import { getProvider } from "./providers/";
import {
  ComputedNetwork,
  LaunchConfig,
  Node,
  Parachain,
  fileMap,
} from "./types";

import { spawnIntrospector } from "./network-helpers/instrospector";
import { setTracingCollatorConfig } from "./network-helpers/tracing-collator";
import { nodeChecker, verifyNodes } from "./network-helpers/verifier";
import { Client } from "./providers/client";
import { KubeClient } from "./providers/k8s/kubeClient";
import { spawnNode } from "./spawner";

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
  silent?: boolean; // Mute logging output
}

export async function start(
  credentials: string,
  launchConfig: LaunchConfig,
  options?: OrcOptionsInterface,
) {
  const opts = {
    ...{ monitor: false, spawnConcurrency: 1, inCI: false, silent: true },
    ...options,
  };

  setSilent(opts.silent);
  let network: Network | undefined;
  let cronInterval = undefined;

  try {
    // Parse and build Network definition
    const networkSpec: ComputedNetwork = await generateNetworkSpec(
      launchConfig,
    );

    // IFF there are network references in cmds we need to switch to concurrency 1
    if (TOKEN_PLACEHOLDER.test(JSON.stringify(networkSpec))) {
      debug(
        "Network definition use network references, switching concurrency to 1",
      );
      opts.spawnConcurrency = 1;
    }

    debug(JSON.stringify(networkSpec, null, 4));

    const { initClient, setupChainSpec, getChainSpecRaw } = getProvider(
      networkSpec.settings.provider,
    );

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
          decorators.yellow(
            "Directory already exists; \nDo you want to continue? (y/N)",
          ),
        );
        if (response.toLowerCase() !== "y") {
          console.log("Exiting...");
          process.exit(1);
        }
      }
    }

    const localMagicFilepath = `${tmpDir.path}/finished.txt`;
    // Create MAGIC file to stop temp/init containers
    fs.openSync(localMagicFilepath, "w");

    // Define chain name and file name to use.
    const chainSpecFileName = `${networkSpec.relaychain.chain}.json`;
    const chainName = networkSpec.relaychain.chain;
    const chainSpecFullPath = `${tmpDir.path}/${chainSpecFileName}`;
    const chainSpecFullPathPlain = chainSpecFullPath.replace(
      ".json",
      "-plain.json",
    );

    const client: Client = initClient(credentials, namespace, tmpDir.path);

    if (networkSpec.settings.node_spawn_timeout)
      client.timeout = networkSpec.settings.node_spawn_timeout;
    network = new Network(client, namespace, tmpDir.path);

    const zombieTable = new CreateLogTable({
      head: [
        decorators.green("🧟 Zombienet 🧟"),
        decorators.green("Initiation"),
      ],
      colWidths: [20, 100],
      doubleBorder: true,
    });

    zombieTable.pushTo([
      [
        decorators.green("Provider"),
        decorators.blue(networkSpec.settings.provider),
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
        `\n\t\t ${decorators.reverse(
          decorators.red("⚠ Can not access"),
        )} ${decorators.magenta(
          networkSpec.settings.provider,
        )}, please check your config.`,
      );
      process.exit(1);
    }

    const zombieWrapperLocalPath = `${tmpDir.path}/${ZOMBIE_WRAPPER}`;
    const zombieWrapperContent = await fs.promises.readFile(zombieWrapperPath);
    await fs.promises.writeFile(
      zombieWrapperLocalPath,
      zombieWrapperContent
        .toString()
        .replace("{{REMOTE_DIR}}", client.remoteDir!),
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

    // create or copy relay chain spec
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
    const chainSpecContent = readAndParseChainSpec(chainSpecFullPathPlain);
    const relayChainSpecIsRaw = Boolean(chainSpecContent.genesis?.raw);

    network.chainId = chainSpecContent.id;

    const parachainFilesPromiseGenerator = async (parachain: Parachain) => {
      const parachainFilesPath = `${tmpDir.path}/${parachain.name}`;
      await makeDir(parachainFilesPath);
      await generateParachainFiles(
        namespace,
        tmpDir.path,
        parachainFilesPath,
        chainName,
        parachain,
        relayChainSpecIsRaw,
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
      if (parachain.addToGenesis && !relayChainSpecIsRaw)
        await addParachainToGenesis(
          chainSpecFullPathPlain,
          parachain.id.toString(),
          stateLocalFilePath,
          wasmLocalFilePath,
        );
    }

    if (!relayChainSpecIsRaw) {
      await customizePlainRelayChain(chainSpecFullPathPlain, networkSpec);

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
      const chainSpecContent = readAndParseChainSpec(chainSpecFullPathPlain);
      debug(`Chain name: ${chainSpecContent.name}`);

      new CreateLogTable({ colWidths: [120], doubleBorder: true }).pushToPrint([
        [`Chain name: ${decorators.green(chainSpecContent.name)}`],
      ]);
    } catch (err) {
      console.log(
        `\n ${decorators.red("Unexpected error: ")} \t ${decorators.bright(
          err,
        )}\n`,
      );
      throw new Error(
        `${decorators.red(`Error:`)} \t ${decorators.bright(
          ` chain-spec raw file at ${chainSpecFullPath} is not a valid JSON`,
        )}`,
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

    const bootnodes: string[] = [];

    if (launchConfig.settings.bootnode) {
      const bootnodeSpec = await generateBootnodeSpec(networkSpec);
      networkSpec.relaychain.nodes.unshift(bootnodeSpec);
    }

    const monitorIsAvailable = await client.isPodMonitorAvailable();
    let jaegerUrl: string | undefined = undefined;
    if (networkSpec.settings.enable_tracing) {
      switch (client.providerName) {
        case "kubernetes":
          if (networkSpec.settings.jaeger_agent)
            jaegerUrl = networkSpec.settings.jaeger_agent;
          break;
        case "podman":
          jaegerUrl = `${await client.getNodeIP("tempo")}:6831`;
          break;
      }
      if (process.env.ZOMBIE_JAEGER_URL)
        jaegerUrl = process.env.ZOMBIE_JAEGER_URL;
    }

    const spawnOpts = {
      silent: opts.silent,
      inCI: opts.inCI,
      monitorIsAvailable,
      userDefinedTypes,
      jaegerUrl,
      local_ip: networkSpec.settings.local_ip,
    };

    const firstNode = networkSpec.relaychain.nodes.shift();
    if (firstNode) {
      const nodeMultiAddress = await spawnNode(
        client,
        firstNode,
        network,
        bootnodes,
        filesToCopyToNodes,
        spawnOpts,
      );
      await sleep(2000);

      // add bootnodes to chain spec
      bootnodes.push(nodeMultiAddress);
      await addBootNodes(chainSpecFullPath, bootnodes);

      if (client.providerName === "kubernetes") {
        // cache the chainSpec with bootnodes
        const fileBuffer = await fs.promises.readFile(chainSpecFullPath);
        const fileHash = getSha256(fileBuffer.toString());
        const parts = chainSpecFullPath.split("/");
        const fileName = parts[parts.length - 1];
        await (client as KubeClient).uploadToFileserver(
          chainSpecFullPath,
          fileName,
          fileHash,
        );
      }
    }

    const promiseGenerators = networkSpec.relaychain.nodes.map((node: Node) => {
      return () =>
        spawnNode(
          client,
          node,
          network!,
          bootnodes,
          filesToCopyToNodes,
          spawnOpts,
        );
    });

    await series(promiseGenerators, opts.spawnConcurrency);

    // TODO: handle `addToBootnodes` in a diff serie.
    // for (const node of networkSpec.relaychain.nodes) {
    //   if (node.addToBootnodes) {
    //     bootnodes.push(network.getNodeByName(node.name).multiAddress);
    //     await addBootNodes(chainSpecFullPath, bootnodes);
    //   }
    // }

    new CreateLogTable({ colWidths: [120], doubleBorder: true }).pushToPrint([
      [decorators.green("All relay chain nodes spawned...")],
    ]);
    debug("\t All relay chain nodes spawned...");

    const collatorPromiseGenerators = [];
    for (const parachain of networkSpec.parachains) {
      if (!parachain.addToGenesis && parachain.registerPara) {
        // register parachain on a running network
        const basePath = `${tmpDir.path}/${parachain.name}`;
        // ensure node is up.
        await nodeChecker(network.relay[0]);
        await registerParachain({
          id: parachain.id,
          wasmPath: `${basePath}/${GENESIS_WASM_FILENAME}`,
          statePath: `${basePath}/${GENESIS_STATE_FILENAME}`,
          apiUrl: network.relay[0].wsUri,
          onboardAsParachain: parachain.onboardAsParachain,
        });
      }

      if (parachain.cumulusBased) {
        const firstCollatorNode = parachain.collators.shift();
        if (firstCollatorNode) {
          const collatorMultiAddress = await spawnNode(
            client,
            firstCollatorNode,
            network,
            [],
            filesToCopyToNodes,
            spawnOpts,
            parachain,
          );
          await sleep(2000);
          // add bootnodes to chain spec
          await addBootNodes(parachain.specPath!, [collatorMultiAddress]);
        }
      }

      collatorPromiseGenerators.push(
        ...parachain.collators.map((node: Node) => {
          return () =>
            spawnNode(
              client,
              node,
              network!,
              [],
              filesToCopyToNodes,
              spawnOpts,
              parachain,
            );
        }),
      );
    }

    // launch all collator in series
    await series(collatorPromiseGenerators, opts.spawnConcurrency);

    // spawn polkadot-introspector if is enable and IFF provider is
    // podman or kubernetes
    if (
      networkSpec.settings.polkadot_introspector &&
      ["podman", "kubernetes"].includes(client.providerName)
    ) {
      const introspectorNetworkNode = await spawnIntrospector(
        client,
        network.relay[0],
        options?.inCI,
      );
      network.addNode(introspectorNetworkNode, Scope.COMPANION);
    }

    // Set `tracing_collator` config to the network if is available.
    await setTracingCollatorConfig(networkSpec, network, client);

    // sleep to give time to last node process' to start
    await sleep(2 * 1000);

    await verifyNodes(network);

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
  } catch (error: any) {
    let errDetails;
    if (
      error?.stderr?.includes(POLKADOT_NOT_FOUND) ||
      error?.stderr?.includes(PARACHAIN_NOT_FOUND)
    ) {
      errDetails = POLKADOT_NOT_FOUND_DESCRIPTION;
    }
    console.log(
      `${decorators.red("Error: ")} \t ${decorators.bright(
        error,
      )}\n\n${decorators.magenta(errDetails)}`,
    );
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
    console.log(
      `\n ${decorators.red("Error: ")} \t ${decorators.bright(error)}\n`,
    );
  } finally {
    if (network) {
      await network.dumpLogs();
      await network.stop();
    }
  }
}
