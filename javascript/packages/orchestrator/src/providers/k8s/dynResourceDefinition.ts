import { getRandomPort, getSha256 } from "@zombienet/utils";
import { genCmd, genCumulusCollatorCmd } from "../../cmdGenerator";
import { getUniqueName } from "../../configGenerator";
import {
  FINISH_MAGIC_FILE,
  P2P_PORT,
  PROMETHEUS_PORT,
  RPC_HTTP_PORT,
  RPC_WS_PORT,
  TMP_DONE,
  TRANSFER_CONTAINER_NAME,
  WAIT_UNTIL_SCRIPT_SUFIX,
} from "../../constants";
import { Network } from "../../network";
import { Node } from "../../types";

export async function genBootnodeDef(
  namespace: string,
  nodeSetup: Node,
): Promise<any> {
  const [volume_mounts, devices] = make_volume_mounts();
  const container = await make_main_container(nodeSetup, volume_mounts);
  const transferContainter = make_transfer_containter();
  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: "bootnode",
      labels: {
        "app.kubernetes.io/name": namespace,
        "app.kubernetes.io/instance": "bootnode",
        "zombie-role": "bootnode",
        app: "zombienet",
      },
    },
    spec: {
      hostname: "bootnode",
      containers: [container],
      initContainers: [transferContainter],
      restartPolicy: "Never",
      volumes: devices,
      securityContext: {
        fsGroup: 1000,
        runAsUser: 1000,
        runAsGroup: 1000,
      },
    },
  };
}

export async function genNodeDef(
  namespace: string,
  nodeSetup: Node,
): Promise<any> {
  const [volume_mounts, devices] = make_volume_mounts();
  const container = await make_main_container(nodeSetup, volume_mounts);
  const transferContainter = make_transfer_containter();

  const containersToRun = [container];
  if (
    (nodeSetup.zombieRole === "node" ||
      nodeSetup.zombieRole === "cumulus-collator") &&
    nodeSetup.jaegerUrl &&
    nodeSetup.jaegerUrl === "localhost:6831"
  ) {
    // add sidecar
    containersToRun.push(jaegerAgentDef());
  }

  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: nodeSetup.name,
      labels: {
        "zombie-role": nodeSetup.validator ? "authority" : "full-node",
        app: "zombienet",
        "app.kubernetes.io/name": namespace,
        "app.kubernetes.io/instance": nodeSetup.name,
      },
      annotations: {
        "prometheus.io/scrape": "true",
        "prometheus.io/port": PROMETHEUS_PORT + "", //force string
      },
    },
    spec: {
      hostname: nodeSetup.name,
      containers: containersToRun,
      initContainers: [transferContainter],
      restartPolicy: "Never",
      volumes: devices,
      securityContext: {
        fsGroup: 1000,
        runAsUser: 1000,
        runAsGroup: 1000,
      },
    },
  };
}

function make_transfer_containter(): any {
  return {
    name: TRANSFER_CONTAINER_NAME,
    image: "docker.io/alpine",
    imagePullPolicy: "Always",
    volumeMounts: [
      { name: "tmp-cfg", mountPath: "/cfg", readOnly: false },
      { name: "tmp-data", mountPath: "/data", readOnly: false },
      { name: "tmp-relay-data", mountPath: "/relay-data", readOnly: false },
    ],
    command: [
      "ash",
      "-c",
      [
        "wget https://github.com/moparisthebest/static-curl/releases/download/v7.83.1/curl-amd64 -O /cfg/curl",
        "echo downloaded",
        "chmod +x /cfg/curl",
        "echo chmoded",
        "wget https://github.com/uutils/coreutils/releases/download/0.0.17/coreutils-0.0.17-x86_64-unknown-linux-musl.tar.gz -O /cfg/coreutils-0.0.17-x86_64-unknown-linux-musl.tar.gz",
        "cd /cfg",
        "tar -xvzf ./coreutils-0.0.17-x86_64-unknown-linux-musl.tar.gz",
        "cp ./coreutils-0.0.17-x86_64-unknown-linux-musl/coreutils /cfg/coreutils",
        "chmod +x /cfg/coreutils",
        "rm -rf ./coreutils-0.0.17-x86_64-unknown-linux-musl",
        "echo coreutils downloaded",
        `until [ -f ${FINISH_MAGIC_FILE} ]; do echo waiting for tar to finish; sleep 1; done; echo copy files has finished`,
      ].join(" && "),
    ],
  };
}

function make_volume_mounts(): [any, any] {
  const volume_mounts = [
    { name: "tmp-cfg", mountPath: "/cfg", readOnly: false },
    { name: "tmp-data", mountPath: "/data", readOnly: false },
    { name: "tmp-relay-data", mountPath: "/relay-data", readOnly: false },
  ];

  const devices = [
    { name: "tmp-cfg" },
    { name: "tmp-data" },
    { name: "tmp-relay-data" },
  ];

  return [volume_mounts, devices];
}

async function make_main_container(
  nodeSetup: Node,
  volume_mounts: any[],
): Promise<any> {
  const ports = [
    { containerPort: PROMETHEUS_PORT, name: "prometheus" },
    { containerPort: RPC_HTTP_PORT, name: "rpc-http" },
    { containerPort: RPC_WS_PORT, name: "rpc-ws" },
    { containerPort: P2P_PORT, name: "p2p" },
  ];

  let computedCommand;
  if (nodeSetup.zombieRole === "cumulus-collator") {
    computedCommand = await genCumulusCollatorCmd(nodeSetup);
  } else {
    computedCommand = await genCmd(nodeSetup);
  }

  const containerDef: any = {
    image: nodeSetup.image,
    name: nodeSetup.name,
    imagePullPolicy: "Always",
    ports,
    env: nodeSetup.env,
    volumeMounts: volume_mounts,
    command: computedCommand,
  };

  if (nodeSetup.resources) containerDef.resources = nodeSetup.resources;

  return containerDef;
}

function jaegerAgentDef() {
  return {
    name: "jaeger-agent",
    image: "jaegertracing/jaeger-agent:1.28.0",
    ports: [
      {
        containerPort: 5775,
        protocol: "UDP",
      },
      {
        containerPort: 5778,
        protocol: "TCP",
      },
      {
        containerPort: 6831,
        protocol: "UDP",
      },
      {
        containerPort: 6832,
        protocol: "UDP",
      },
    ],
    command: [
      "/go/bin/agent-linux",
      "--reporter.type=grpc",
      "--reporter.grpc.host-port=tempo-tempo-distributed-distributor.tempo.svc.cluster.local:14250",
    ],
    resources: {
      limits: {
        memory: "50M",
        cpu: "100m",
      },
      requests: {
        memory: "50M",
        cpu: "100m",
      },
    },
  };
}

export function replaceNetworkRef(podDef: any, network: Network) {
  // replace command if needed in containers
  for (const container of podDef.spec.containers) {
    if (Array.isArray(container.command)) {
      const finalCommand = container.command.map((item: string) =>
        network.replaceWithNetworInfo(item),
      );
      container.command = finalCommand;
    } else {
      container.command = network.replaceWithNetworInfo(container.command);
    }
  }
}

export async function createTempNodeDef(
  name: string,
  image: string,
  chain: string,
  fullCommand: string,
) {
  const nodeName = getUniqueName("temp");
  let node: Node = {
    name: nodeName,
    key: getSha256(nodeName),
    image,
    fullCommand:
      fullCommand + " && " + TMP_DONE + " && " + WAIT_UNTIL_SCRIPT_SUFIX, // leave the pod runnig until we finish transfer files
    chain,
    validator: false,
    invulnerable: false,
    bootnodes: [],
    args: [],
    env: [],
    telemetryUrl: "",
    overrides: [],
    zombieRole: "temp",
    p2pPort: await getRandomPort(),
    wsPort: await getRandomPort(),
    rpcPort: await getRandomPort(),
    prometheusPort: await getRandomPort(),
  };

  return node;
}
