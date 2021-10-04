import { KubeClient } from "./kubeWrapper";
import { LaunchConfig, ComputedNetwork, Node } from "./types";
import { generateNetworkSpec, generateBootnodeSpec, getUniqueName, FINISH_MAGIC_FILE, DEFAULT_COLLATOR_IMAGE, GENESIS_STATE_FILENAME, GENESIS_WASM_FILENAME } from "./configManager";
import { Network, NetworkNode } from "./network";
import { startPortForwarding } from "./portForwarder";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { generateNamespace, sleep } from "./utils";
import { genBootnodeDef, genPodDef } from "./dynResourceDefinition";
import tmp from "tmp-promise";
import fs from "fs";
import { node } from "execa";

const WAIT_UNTIL_SCRIPT_SUFIX = `until [ -f ${FINISH_MAGIC_FILE} ]; do echo waiting for tar to finish; sleep 1; done; echo tar has finished`;

export async function start(
  credentials: string,
  networkConfig: LaunchConfig,
  withMetrics: boolean = false
) {
  let network: Network;
  let transferIdentifier: string = '';
  try {
    // Parse and build Network definition
    const networkSpec: ComputedNetwork = generateNetworkSpec(networkConfig);

    // global timeout
    setTimeout(() => {
      if(!network.launched) {
        console.log("GLOBAL TIMEOUT");
        // throw new Error(`GLOBAL TIMEOUT (${networkSpec.settings.timeout} secs) `);
      }
    }, networkSpec.settings.timeout * 1000);

    // Create namespace
    const namespace = generateNamespace();
    const client = new KubeClient(credentials, namespace);
    network = new Network(client, namespace);

    console.log(`\t Launching network under namespace: ${namespace}`);

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
    console.log( `\t Temp Dir: ${tempDir.path}`);
    // Create MAGIC file to stop temp/init containers
    fs.openSync(localMagicFilepath, 'w');

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
    if(withMetrics) await staticSetup(client);


    // bootnode
    // TODO: allow to customize the bootnode
    const bootnodeSpec = await generateBootnodeSpec(networkSpec);
    const bootnodeDef = await genBootnodeDef(client,bootnodeSpec );
    console.log( bootnodeDef );
    await client.crateResource( bootnodeDef, true, true );

    // make sure the bootnode is up and available over DNS
    await sleep(4000);

    const identifier = `${bootnodeDef.kind}/${bootnodeDef.metadata.name}`;
    const fwdPort = await startPortForwarding(9944, identifier, namespace);
    const wsUri =  `ws://127.0.0.1:${fwdPort}`; //TODO: change address
    const provider = new WsProvider(wsUri);
    const api = await ApiPromise.create({ provider });

    const networkNode: NetworkNode = {
      name: bootnodeDef.metadata.name,
      apiInstance: api,
      wsUri,
      autoConnectApi: bootnodeSpec.autoConnectApi
    };

    network.addNode(networkNode);

    if( networkSpec.relaychain.chainSpecCommand ) {
      let node: Node = {
        name: getUniqueName("temp"),
        validator: false,
        image: networkSpec.relaychain.defaultImage,
        commandWithArgs: networkSpec.relaychain.chainSpecCommand + " && " + WAIT_UNTIL_SCRIPT_SUFIX, // leave the pod runnig until we finish transfer files
        chain: networkSpec.relaychain.chain,
        bootnodes: [],
        args: [],
        env: [],
        autoConnectApi: false
      }
      const podDef = await genPodDef(client, node);
      await client.crateResource( podDef, true, true );
      const identifier = `${podDef.metadata.name}`;
      const fileName = `${networkSpec.relaychain.chain}.json`
      await client.copyFileFromPod(identifier,`/cfg/${fileName}`, `${tempDir.path}/${fileName}`);
      await client.copyFileToPod(identifier, localMagicFilepath, FINISH_MAGIC_FILE);
    }

    // Create nodes
    for (const node of networkSpec.relaychain.nodes) {
      // create the node and attach to the network object
      const podDef = await genPodDef(client, node);
      console.log("-----DEBUG----\n");
      console.log( "\t" + JSON.stringify(podDef));
      console.log("\n");
      await client.crateResource( podDef, true, true );

      const identifier = `${podDef.kind}/${podDef.metadata.name}`;
      const fwdPort = await startPortForwarding(9944, identifier, namespace);
      const wsUri =  `ws://127.0.0.1:${fwdPort}`; //TODO: change address

      const networkNode: NetworkNode = {
        name: node.name,
        wsUri,
        autoConnectApi: node.autoConnectApi
      };

      network.addNode(networkNode);
    }

    console.log("\t All relay chain nodes spawned...");
    // sleep 2 secs before connect the api
    await sleep(3000);

    for(const node  of network.nodes) {
      if(!node.autoConnectApi) continue;
      const provider = new WsProvider(node.wsUri);
      const api = await ApiPromise.create({ provider });
      node.apiInstance = api;
    }


    for( const parachain of networkSpec.parachains) {
      let wasmLocalFilePath, stateLocalFilePath;
      // check if we need to create files
      if( parachain.genesisStateGenerator || parachain.genesisWasmGenerator) {
        let commands = [];
        if(parachain.genesisStateGenerator) commands.push(parachain.genesisStateGenerator);
        if(parachain.genesisWasmGenerator) commands.push(parachain.genesisWasmGenerator);
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
          autoConnectApi: false
        }
        const podDef = await genPodDef(client, node);
        await client.crateResource( podDef, true, true );
        const identifier = `${podDef.metadata.name}`;
        if( parachain.genesisStateGenerator ) {
          stateLocalFilePath = `${tempDir.path}/${GENESIS_STATE_FILENAME}`;
          await client.copyFileFromPod(identifier,`/cfg/${GENESIS_STATE_FILENAME}`, stateLocalFilePath);
        }

        if( parachain.genesisWasmGenerator ) {
          wasmLocalFilePath = `${tempDir.path}/${GENESIS_WASM_FILENAME}`;
          await client.copyFileFromPod(identifier,`/cfg/${GENESIS_STATE_FILENAME}`, wasmLocalFilePath);
        }

        // put file to terminate pod
        await client.copyFileToPod(identifier, localMagicFilepath, FINISH_MAGIC_FILE);
      }

      if( ! stateLocalFilePath ) stateLocalFilePath = parachain.genesisStatePath;
      if( ! wasmLocalFilePath ) wasmLocalFilePath = parachain.genesisWasmPath;

      // CHEKC
      if( ! stateLocalFilePath || ! wasmLocalFilePath) throw new Error("Invalid state or wasm files");

      // register parachain
      await network.registerParachain(parachain.id, wasmLocalFilePath, stateLocalFilePath);

      let finalCommandWithArgs = parachain.collator.commandWithArgs || parachain.collator.command;

      // create collator
      let collator: Node = {
        name: getUniqueName(parachain.collator.name),
        validator: false,
        image: parachain.collator.image,
        commandWithArgs: WAIT_UNTIL_SCRIPT_SUFIX + " && " + finalCommandWithArgs,
        chain: networkSpec.relaychain.chain,
        bootnodes: [],
        args: [],
        env: [],
        autoConnectApi: false
        // initContainers: [
        //   {
        //     name: "init-transfer",
        //     image: "busybox:1.28",
        //     command: ['sh', '-c', WAIT_UNTIL_SCRIPT_SUFIX],
        //     volumeMounts:
        //     [
        //         {
        //             "name": "tmp-cfg",
        //             "mountPath": "/cfg",
        //             "readOnly": false
        //         }
        //     ],
        //   }
        // ]
      }
      const podDef = await genPodDef(client, collator);
      await client.crateResource( podDef, true, true );
      await sleep(1000);
      const identifier = `${podDef.metadata.name}`;
      const fileName = `${networkSpec.relaychain.chain}.json`
      await client.copyFileToPod(identifier, `${tempDir.path}/${fileName}`, `/cfg/${fileName}`);
      await client.copyFileToPod(identifier, localMagicFilepath, FINISH_MAGIC_FILE);

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

    // TODO: run test
    console.log(network);
    // prevent global timeout
    network.launched = true;
    console.log("\t 🚀 LAUNCH COMPLETE 🚀");
    return network;
  } catch (error) {
    console.error(error);
    // Allow debug on error
    // if(network) await network.stop();
    process.exit(1);
  }
}


export async function test(credentials: string, networkConfig: LaunchConfig, cb: (network: Network) => void) {
  try {
    const network: Network = await start(credentials, networkConfig);
    await cb(network);
    network.stop();
  }
  catch(error) {
    console.error(error);
  }
}

async function staticSetup(client: KubeClient) {
  let storageFiles: string[] = (await client.runningOnMinikube())
    ? [
        "node-data-tmp-storage-class-minikube.yaml",
        "node-data-persistent-storage-class-minikube.yaml",
      ]
    : [
        "node-data-tmp-storage-class.yaml",
        "node-data-persistent-storage-class.yaml",
      ];

  const resources = [
    { type: "role", files: ["prometheus-role.yaml"] },
    { type: "binding", files: ["prometheus-role-binding.yaml"] },
    { type: "binding", files: ["prometheus-role-binding.yaml"] },
    { type: "data-storage-classes", files: storageFiles },
    {
      type: "configs",
      files: ["prometheus-config.yaml", "grafana-config.yaml"],
    },
    {
      type: "services",
      files: [
        "bootnode-service.yaml",
        "telemetry-service.yaml",
        "prometheus-service.yaml",
      ],
    },
    {
      type: "deployment",
      files: [
        "prometheus-deployment.yaml",
        "grafana-deployment.yaml",
        "telemetry-deployment.yaml",
      ],
    },
  ];

  for (const resourceType of resources) {
    console.log(`adding ${resourceType.type}`);
    for (const file of resourceType.files) {
      await client.crateStaticResource(file);
    }
  }
}

