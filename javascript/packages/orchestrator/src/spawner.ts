import type { LogType } from "@zombienet/utils";
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
  RPC_HTTP_PORT,
  RPC_WS_PORT,
  WS_URI_PATTERN,
} from "./constants";
import { generateKeystoreFiles } from "./keys";
import { Network, Scope } from "./network";
import { NetworkNode } from "./networkNode";
import { getProvider } from "./providers";
import { Client } from "./providers/client";
import { NodeMultiAddress, fileMap } from "./types";
import { Node, ZombieRole, Parachain } from "./sharedTypes";
const debug = require("debug")("zombie::spawner");

export const spawnNode = async (
  client: Client,
  node: Node,
  network: Network,
  bootnodes: string[],
  filesToCopy: fileMap[],
  opts: {
    logType: LogType;
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
    : genNodeDef(namespace, node, opts.inCI));

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

    const isAssetHubPolkadot =
      parachain &&
      (parachain.chain?.includes("statemint") ||
        parachain.chain?.includes("asset-hub-polkadot") ||
        parachain.chainSpecPath?.includes("statemint") ||
        parachain.chainSpecPath?.includes("asset-hub-polkadot"));
    const keystoreFiles = await generateKeystoreFiles(
      node,
      nodeFilesPath,
      isAssetHubPolkadot,
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
    true, // long running
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

  const endpointPort =
    node.substrateCliArgsVersion == 0 ? RPC_WS_PORT : RPC_HTTP_PORT;
  if (opts.inCI) {
    // UPDATE: 04-10-2024 Since we have several reports of failures related to
    // can't access metrics by dns, we switch back to use the pod ip.

    // in CI we deploy a service (with the pod name) in front of each pod
    // so here we can use the name (as short dns in the ns) to connect to pod.
    // const nodeDns = `${podDef.metadata.name}.${namespace}.svc.cluster.local`;
    const pod_ip = await client.getNodeIP(node.name);
    networkNode = new NetworkNode(
      node.name,
      WS_URI_PATTERN.replace("{{IP}}", pod_ip).replace(
        "{{PORT}}",
        endpointPort.toString(),
      ),
      METRICS_URI_PATTERN.replace("{{IP}}", pod_ip).replace(
        "{{PORT}}",
        PROMETHEUS_PORT.toString(),
      ),
      nodeMultiAddress,
      opts.userDefinedTypes,
      node.prometheusPrefix,
    );
  } else {
    const external_port =
      node.externalPorts![
        node.substrateCliArgsVersion == 0 ? "wsPort" : "rpcPort"
      ];
    const nodeIdentifier = `service/${podDef.metadata.name}`;
    const fwdPort = await client.startPortForwarding(
      endpointPort,
      nodeIdentifier,
      namespace,
      external_port,
    );

    const external_port_prom = node.externalPorts!["prometheusPort"];
    const nodePrometheusPort = await client.startPortForwarding(
      PROMETHEUS_PORT,
      nodeIdentifier,
      namespace,
      external_port_prom,
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
  // add the full spec
  networkNode.spec = node;

  if (parachain) {
    const paraId = parachain.id;
    if (!network.paras[paraId])
      network.addPara(
        paraId,
        parachain.specPath,
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

    if (opts.logType !== "silent")
      console.log(client.getLogsCommand(podDef.metadata.name) + "\n\n");
  }

  return nodeMultiAddress;
};
