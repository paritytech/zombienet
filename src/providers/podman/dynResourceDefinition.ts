import { genCmd, genCumulusCollatorCmd } from "../../cmdGenerator";
import {
  PROMETHEUS_PORT,
  FINISH_MAGIC_FILE,
  TRANSFER_CONTAINER_NAME,
  RPC_HTTP_PORT,
  P2P_PORT,
  DEFAULT_COMMAND,
  INTROSPECTOR_POD_NAME,
  RPC_WS_PORT,
} from "../../constants";
import { getUniqueName } from "../../configGenerator";
import { Node } from "../../types";
import { getRandomPort } from "../../utils/net-utils";
import { getClient } from "../client";
import { resolve } from "path";
import { Network } from "../../network";

const fs = require("fs").promises;

export async function genBootnodeDef(
  namespace: string,
  nodeSetup: Node,
): Promise<any> {
  const [volume_mounts, devices] = await make_volume_mounts(nodeSetup.name);
  const container = await make_main_container(nodeSetup, volume_mounts);
  const transferContainter = make_transfer_containter();
  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: "bootnode",
      namespace: namespace,
      labels: {
        "app.kubernetes.io/name": namespace,
        "app.kubernetes.io/instance": "bootnode",
        "zombie-role": "bootnode",
        app: "zombienet",
        "zombie-ns": namespace,
      },
    },
    spec: {
      hostname: "bootnode",
      containers: [container],
      initContainers: [transferContainter],
      restartPolicy: "OnFailure",
      volumes: devices,
    },
  };
}

export async function genPrometheusDef(namespace: string): Promise<any> {
  const client = getClient();
  const volume_mounts = [
    { name: "prom-cfg", mountPath: "/etc/prometheus", readOnly: false },
    { name: "prom-data", mountPath: "/data", readOnly: false },
  ];
  const cfgPath = `${client.tmpDir}/prometheus/etc`;
  const dataPath = `${client.tmpDir}/prometheus/data`;
  await fs.mkdir(cfgPath, { recursive: true });
  await fs.mkdir(dataPath, { recursive: true });

  const devices = [
    { name: "prom-cfg", hostPath: { type: "Directory", path: cfgPath } },
    { name: "prom-data", hostPath: { type: "Directory", path: dataPath } },
  ];

  const config = `# config
global:
  scrape_interval: 5s
  external_labels:
    monitor: 'zombienet-monitor'
# Scraping Prometheus itself
scrape_configs:
- job_name: 'prometheus'
  static_configs:
  - targets: ['localhost:9090']
- job_name: 'dynamic'
  file_sd_configs:\n\
  - files:
    - /data/sd_config*.yaml
    - /data/sd_config*.json
    refresh_interval: 5s
`;

  await fs.writeFile(`${cfgPath}/prometheus.yml`, config);

  const ports = [
    {
      containerPort: 9090,
      name: "prometheus_endpoint",
      hostPort: await getRandomPort(),
    },
  ];

  const containerDef = {
    image: "prom/prometheus",
    name: "prometheus",
    imagePullPolicy: "Always",
    ports,
    volumeMounts: volume_mounts,
  };

  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: "prometheus",
      namespace: namespace,
      labels: {
        "app.kubernetes.io/name": namespace,
        "app.kubernetes.io/instance": "prometheus",
        "zombie-role": "prometheus",
        app: "zombienet",
        "zombie-ns": namespace,
      },
    },
    spec: {
      hostname: "prometheus",
      containers: [containerDef],
      restartPolicy: "OnFailure",
      volumes: devices,
    },
  };
}

export async function genGrafanaDef(
  namespace: string,
  prometheusIp: string,
  tempoIp: string,
): Promise<any> {
  const client = getClient();
  const volume_mounts = [
    {
      name: "datasources-cfg",
      mountPath: "/etc/grafana/provisioning/datasources",
      readOnly: false,
    },
  ];
  const datasourcesPath = `${client.tmpDir}/grafana/datasources`;
  await fs.mkdir(datasourcesPath, { recursive: true });

  const devices = [
    {
      name: "datasources-cfg",
      hostPath: { type: "Directory", path: datasourcesPath },
    },
  ];

  const datasource = `
# config file version
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    orgId: 1
    url: http://${prometheusIp}:9090
    version: 1
    editable: true
  - name: Tempo
    type: tempo
    access: proxy
    orgId: 1
    url: http://${tempoIp}:3200
    version: 1
    editable: true
`;

  await fs.writeFile(`${datasourcesPath}/prometheus.yml`, datasource);

  const ports = [
    {
      containerPort: 3000,
      name: "grafana_web",
      hostPort: await getRandomPort(),
    },
  ];

  const containerDef = {
    image: "grafana/grafana",
    name: "grafana",
    imagePullPolicy: "Always",
    ports,
    volumeMounts: volume_mounts,
  };

  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: "grafana",
      namespace: namespace,
      labels: {
        "app.kubernetes.io/name": namespace,
        "app.kubernetes.io/instance": "grafana",
        "zombie-role": "grafana",
        app: "zombienet",
        "zombie-ns": namespace,
      },
    },
    spec: {
      hostname: "grafana",
      containers: [containerDef],
      restartPolicy: "OnFailure",
      volumes: devices,
    },
  };
}

export async function getIntrospectorDef(
  namespace: string,
  wsUri: string,
): Promise<any> {
  const ports = [
    {
      containerPort: 65432,
      name: "prometheus",
      hostPort: await getRandomPort(),
    },
  ];

  const containerDef = {
    image: "paritytech/polkadot-introspector:latest",
    name: INTROSPECTOR_POD_NAME,
    args: ["block-time-monitor", `--ws=${wsUri}`, "prometheus"],
    imagePullPolicy: "Always",
    ports,
    volumeMounts: [],
  };

  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: INTROSPECTOR_POD_NAME,
      namespace: namespace,
      labels: {
        "app.kubernetes.io/name": namespace,
        "app.kubernetes.io/instance": INTROSPECTOR_POD_NAME,
        "zombie-role": INTROSPECTOR_POD_NAME,
        app: "zombienet",
        "zombie-ns": namespace,
      },
    },
    spec: {
      hostname: INTROSPECTOR_POD_NAME,
      containers: [containerDef],
      restartPolicy: "OnFailure",
    },
  };
}

export async function genTempoDef(namespace: string): Promise<any> {
  const client = getClient();

  const volume_mounts = [
    { name: "tempo-cfg", mountPath: "/etc/tempo", readOnly: false },
    { name: "tempo-data", mountPath: "/data", readOnly: false },
  ];
  const cfgPath = `${client.tmpDir}/tempo/etc`;
  const dataPath = `${client.tmpDir}/tempo/data`;
  await fs.mkdir(cfgPath, { recursive: true });
  await fs.mkdir(dataPath, { recursive: true });

  const devices = [
    { name: "tempo-cfg", hostPath: { type: "Directory", path: cfgPath } },
    { name: "tempo-data", hostPath: { type: "Directory", path: dataPath } },
  ];

  const tempoConfigPath = resolve(
    __dirname,
    `../../../static-configs/tempo.yaml`,
  );
  await fs.copyFile(tempoConfigPath, `${cfgPath}/tempo.yaml`);

  const ports = [
    {
      containerPort: 14268,
      name: "jaeger_ingest",
      hostPort: await getRandomPort(),
    },
    {
      containerPort: 3100,
      name: "tempo",
      hostPort: await getRandomPort(),
    },
    {
      containerPort: 4317,
      name: "otlp_grpc",
      hostPort: await getRandomPort(),
    },
    {
      containerPort: 4318,
      name: "otlp_http",
      hostPort: await getRandomPort(),
    },
    {
      containerPort: 9411,
      name: "zipkin",
      hostPort: await getRandomPort(),
    },
  ];

  const containerDef = {
    image: "grafana/tempo:latest",
    name: "tempo",
    args: ["-config.file=/etc/tempo/tempo.yaml"],
    imagePullPolicy: "Always",
    ports,
    volumeMounts: volume_mounts,
  };

  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: "tempo",
      namespace: namespace,
      labels: {
        "app.kubernetes.io/name": namespace,
        "app.kubernetes.io/instance": "tempo",
        "zombie-role": "tempo",
        app: "zombienet",
        "zombie-ns": namespace,
      },
    },
    spec: {
      hostname: "tempo",
      containers: [containerDef],
      restartPolicy: "OnFailure",
      volumes: devices,
    },
  };
}

export async function genNodeDef(
  namespace: string,
  nodeSetup: Node,
): Promise<any> {
  const [volume_mounts, devices] = await make_volume_mounts(nodeSetup.name);
  const container = await make_main_container(nodeSetup, volume_mounts);
  const transferContainter = make_transfer_containter();

  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: nodeSetup.name,
      namespace: namespace,
      labels: {
        "zombie-role": nodeSetup.validator ? "authority" : "full-node",
        app: "zombienet",
        "zombie-ns": namespace,
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
      containers: [container],
      initContainers: [transferContainter],
      restartPolicy: "OnFailure",
      volumes: devices,
    },
  };
}

function make_transfer_containter(): any {
  return {
    name: TRANSFER_CONTAINER_NAME,
    image: "docker.io/alpine",
    imagePullPolicy: "Always",
    volumeMounts: [{ name: "tmp-cfg", mountPath: "/cfg", readOnly: false }],
    command: [
      "ash",
      "-c",
      `until [ -f ${FINISH_MAGIC_FILE} ]; do echo waiting for tar to finish; sleep 1; done; echo copy files has finished`,
    ],
  };
}
async function make_volume_mounts(name: string): Promise<[any, any]> {
  const volume_mounts = [
    { name: "tmp-cfg", mountPath: "/cfg", readOnly: false },
    { name: "tmp-data", mountPath: "/data", readOnly: false },
  ];

  const client = getClient();
  const cfgPath = `${client.tmpDir}/${name}/cfg`;
  const dataPath = `${client.tmpDir}/${name}/data`;
  await fs.mkdir(cfgPath, { recursive: true });

  await fs.mkdir(dataPath, { recursive: true });

  const devices = [
    { name: "tmp-cfg", hostPath: { type: "Directory", path: cfgPath } },
    { name: "tmp-data", hostPath: { type: "Directory", path: dataPath } },
  ];

  return [volume_mounts, devices];
}

async function make_main_container(
  nodeSetup: Node,
  volume_mounts: any[],
): Promise<any> {
  const ports = [
    {
      containerPort: PROMETHEUS_PORT,
      name: "prometheus",
      hostPort: await getRandomPort(),
    },
    {
      containerPort: RPC_HTTP_PORT,
      name: "rpc",
      hostPort: await getRandomPort(),
    },
    {
      containerPort: RPC_WS_PORT,
      name: "rpc-ws",
      hostPort: await getRandomPort(),
    },
    { containerPort: P2P_PORT, name: "p2p", hostPort: await getRandomPort() },
  ];

  let computedCommand;
<<<<<<< HEAD
  if( nodeSetup.zombieRole === "cumulus-collator") {
    computedCommand = await genCumulusCollatorCmd(nodeSetup);
=======
  const launchCommand = nodeSetup.command || DEFAULT_COMMAND;
  if (nodeSetup.zombieRole === "cumulus-collator") {
    computedCommand = await genCumulusCollatorCmd(launchCommand, nodeSetup);
>>>>>>> main
  } else {
    computedCommand = await genCmd(nodeSetup);
  }

  let containerDef = {
    image: nodeSetup.image,
    name: nodeSetup.name,
    imagePullPolicy: "Always",
    ports,
    env: nodeSetup.env,
    volumeMounts: volume_mounts,
    command: computedCommand,
  };

  return containerDef;
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
  let node: Node = {
    name: getUniqueName("temp"),
    image,
    fullCommand: fullCommand,
    chain,
    validator: false,
    bootnodes: [],
    args: [],
    env: [],
    telemetryUrl: "",
    overrides: [],
    zombieRole: "temp",
    p2pPort: await getRandomPort(),
    wsPort: await getRandomPort(),
    rpcPort: await getRandomPort(),
    prometheusPort: await getRandomPort()
  };

  return node;
}
