import { getRandomPort, makeDir } from "@zombienet/utils";
import { resolve } from "path";
import { genCmd, genCumulusCollatorCmd } from "../../cmdGenerator";
import { getUniqueName } from "../../configGenerator";
import {
  INTROSPECTOR_POD_NAME,
  P2P_PORT,
  PROMETHEUS_PORT,
  RPC_HTTP_PORT,
  RPC_WS_PORT,
} from "../../constants";
import { Network } from "../../network";
import { Node } from "../../types";
import { getClient } from "../client";

const fs = require("fs").promises;

export async function genBootnodeDef(
  namespace: string,
  nodeSetup: Node,
): Promise<any> {
  const [volume_mounts, devices] = await make_volume_mounts(nodeSetup.name);
  const container = await make_main_container(nodeSetup, volume_mounts);
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
      initContainers: [],
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
  await makeDir(cfgPath, true);
  await makeDir(dataPath, true);

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
    image: "docker.io/prom/prometheus",
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
  await makeDir(datasourcesPath, true);

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
    image: "docker.io/grafana/grafana",
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
    image: "docker.io/paritytech/polkadot-introspector:latest",
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
  await makeDir(cfgPath, true);
  await makeDir(dataPath, true);

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
    image: "docker.io/grafana/tempo:latest",
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
      initContainers: [],
      restartPolicy: "OnFailure",
      volumes: devices,
    },
  };
}

async function make_volume_mounts(name: string): Promise<[any, any]> {
  const volume_mounts = [
    { name: "tmp-cfg", mountPath: "/cfg:U", readOnly: false },
    { name: "tmp-data", mountPath: "/data:U", readOnly: false },
    { name: "tmp-root", mountPath: "/:U", readOnly: false },
    { name: "tmp-relay-data", mountPath: "/relay-data:U", readOnly: false },
  ];

  const client = getClient();
  const rootPath = `${client.tmpDir}/${name}/`;
  const cfgPath = `${rootPath}/cfg`;
  const dataPath = `${rootPath}/data`;
  const relayDataPath = `${rootPath}/relay-data`;
  await makeDir(cfgPath, true);
  await makeDir(dataPath, true);
  await makeDir(relayDataPath, true);

  const devices = [
    { name: "tmp-cfg", hostPath: { type: "Directory", path: cfgPath } },
    { name: "tmp-data", hostPath: { type: "Directory", path: dataPath } },
    { name: "tmp-root", hostPath: { type: "Directory", path: rootPath } },
    {
      name: "tmp-relay-data",
      hostPath: { type: "Directory", path: relayDataPath },
    },
  ];

  return [volume_mounts, devices];
}

async function make_main_container(
  nodeSetup: Node,
  volume_mounts: any[],
): Promise<any> {
  // @ts-ignore
  const { rpcPort, wsPort, prometheusPort, p2pPort } = nodeSetup.externalPorts
    ? nodeSetup.externalPorts
    : {};
  const ports = [
    {
      containerPort: PROMETHEUS_PORT,
      name: "prometheus",
      hostPort: prometheusPort || (await getRandomPort()),
    },
    {
      containerPort: RPC_HTTP_PORT,
      name: "rpc",
      hostPort: rpcPort || (await getRandomPort()),
    },
    {
      containerPort: RPC_WS_PORT,
      name: "rpc-ws",
      hostPort: wsPort || (await getRandomPort()),
    },
    {
      containerPort: P2P_PORT,
      name: "p2p",
      hostPort: p2pPort || (await getRandomPort()),
    },
  ];

  let computedCommand;
  if (nodeSetup.zombieRole === "cumulus-collator") {
    computedCommand = await genCumulusCollatorCmd(nodeSetup);
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
