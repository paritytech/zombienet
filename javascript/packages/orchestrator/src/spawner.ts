import {
  CreateLogTable,
  decorators,
  getLokiUrl,
  makeDir,
} from "@zombienet/utils";
import path from "path";
import { generateNodeMultiAddress } from "./bootnode";
import { getChainIdFromSpec } from "./chainSpec";
import {
  LOCALHOST,
  METRICS_URI_PATTERN,
  PROMETHEUS_PORT,
  RPC_WS_PORT,
  WS_URI_PATTERN,
} from "./constants";
import { generateKeystoreFiles } from "./keys";
import { Network, Scope } from "./network";
import { NetworkNode } from "./networkNode";
import { getProvider } from "./providers";
import { Client } from "./providers/client";
import {
  Node,
  NodeMultiAddress,
  Parachain,
  ZombieRole,
  fileMap,
} from "./types";
const debug = require("debug")("zombie::spawner");

export const spawnNode = async (
  client: Client,
  node: Node,
  network: Network,
  bootnodes: string[],
  filesToCopy: fileMap[],
  opts: {
    silent: boolean;
    inCI: boolean;
    monitorIsAvailable: boolean;
    userDefinedTypes?: any;
    local_ip?: string;
    jaegerUrl?: string;
  },
  parachain?: Parachain,
): Promise<NodeMultiAddress> => {
  const namespace = client.namespace;
  const { genBootnodeDef, genNodeDef, replaceNetworkRef } = getProvider(
    client.providerName,
  );

  let parachainSpecId;
  // for relay chain we can have more than one bootnode.
  if ([ZombieRole.Node, ZombieRole.Collator].includes(node.zombieRole))
    node.bootnodes = node.bootnodes.concat(bootnodes);

  if (opts.jaegerUrl) node.jaegerUrl = opts.jaegerUrl;

  debug(`creating node: ${node.name}`);
  const podDef = await (node.name === "bootnode"
    ? genBootnodeDef(namespace, node)
    : genNodeDef(namespace, node));

  const finalFilesToCopyToNode = [...filesToCopy];

  // add spec file if is provided
  if (parachain?.specPath) {
    finalFilesToCopyToNode.push({
      localFilePath: parachain.specPath,
      remoteFilePath: `${client.remoteDir}/${node.chain}-${parachain.id}.json`,
    });
    parachainSpecId = await getChainIdFromSpec(parachain.specPath);
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
    let nodeFilesPath = client.tmpDir;
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
    parachainSpecId || network.chainId,
    node.dbSnapshot,
  );

  const [nodeIp, nodePort] = await client.getNodeInfo(podDef.metadata.name);
  const nodeMultiAddress = await generateNodeMultiAddress(
    node.key!,
    node.args,
    nodeIp,
    nodePort,
    true,
    node.p2pCertHash,
  );

  let networkNode: NetworkNode;

  const endpointPort = RPC_WS_PORT;
  if (opts.inCI) {
    // in CI we deploy a service (with the pod name) in front of each pod
    // so here we can use the name (as short dns in the ns) to connect to pod.
    const nodeDns = `${podDef.metadata.name}.${namespace}.svc.cluster.local`;
    networkNode = new NetworkNode(
      node.name,
      WS_URI_PATTERN.replace("{{IP}}", nodeDns).replace(
        "{{PORT}}",
        endpointPort.toString(),
      ),
      METRICS_URI_PATTERN.replace("{{IP}}", nodeDns).replace(
        "{{PORT}}",
        PROMETHEUS_PORT.toString(),
      ),
      nodeMultiAddress,
      opts.userDefinedTypes,
      node.prometheusPrefix,
    );
  } else {
    const nodeIdentifier = `service/${podDef.metadata.name}`;
    const fwdPort = await client.startPortForwarding(
      endpointPort,
      nodeIdentifier,
    );
    const nodePrometheusPort = await client.startPortForwarding(
      PROMETHEUS_PORT,
      nodeIdentifier,
    );

    const listeningIp = opts.local_ip || LOCALHOST;

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
      opts.userDefinedTypes,
      node.prometheusPrefix,
    );
  }

  networkNode.group = node.group;

  if (parachain) {
    const paraId = parachain.id;
    if (!network.paras[paraId])
      network.addPara(
        paraId,
        parachain.prometheus_prefix,
        parachain.chainSpecPath,
        parachain.wasmPath,
        parachain.statePath,
      );
    networkNode.parachainId = paraId;
    networkNode.para = parachain.para;
    network.addNode(networkNode, Scope.PARA);
  } else {
    network.addNode(networkNode, Scope.RELAY);
  }

  // Display info about the current node
  const logTable = new CreateLogTable({
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
  if (opts.monitorIsAvailable) {
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
    logTable.print();

    if (!opts.silent)
      console.log(client.getLogsCommand(podDef.metadata.name) + "\n\n");
  }

  return nodeMultiAddress;
};
