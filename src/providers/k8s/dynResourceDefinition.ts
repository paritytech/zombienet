import { genCmd } from "../../cmdGenerator";
import {
  PROMETHEUS_PORT,
  FINISH_MAGIC_FILE,
  TRANSFER_CONTAINER_NAME,
  getUniqueName,
  WAIT_UNTIL_SCRIPT_SUFIX,
} from "../../configManager";
import { Node } from "../../types";

export async function genBootnodeDef(
  namespace: string,
  nodeSetup: Node
): Promise<any> {
  const [volume_mounts, devices] = await make_volume_mounts();
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
      initContainers: nodeSetup.initContainers?.concat([
        transferContainter,
      ]) || [transferContainter],
      restartPolicy: "OnFailure",
      volumes: devices,
    },
  };
}

export async function genNodeDef(
  namespace: string,
  nodeSetup: Node
): Promise<any> {
  const [volume_mounts, devices] = make_volume_mounts();
  const container = await make_main_container(nodeSetup, volume_mounts);
  const transferContainter = make_transfer_containter();

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
      containers: [container],
      initContainers: nodeSetup.initContainers?.concat([
        transferContainter,
      ]) || [transferContainter],
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
function make_volume_mounts(): [any, any] {
  const volume_mounts = [
    { name: "tmp-cfg", mountPath: "/cfg", readOnly: false },
    // { name: "shared", mountPath: "/shared", readOnly: true },
  ];

  const devices = [
    { name: "tmp-cfg" },
    // {
    //   "name": "shared",
    //   "persistentVolumeClaim": {
    //     "claimName": "shared-pv-claim"
    //   }
    // }
  ];

  return [volume_mounts, devices];
}

async function make_main_container(
  nodeSetup: Node,
  volume_mounts: any[]
): Promise<any> {
  const ports = [{ containerPort: PROMETHEUS_PORT, name: "prometheus" }];
  const command = await genCmd(nodeSetup);

  let containerDef = {
    image: nodeSetup.image,
    name: nodeSetup.name,
    imagePullPolicy: "Always",
    ports,
    env: nodeSetup.env,
    volumeMounts: volume_mounts,
    command,
  };

  return containerDef;
}

export function createTempNodeDef(
  name: string,
  image: string,
  chain: string,
  fullCommand: string
) {
  let node: Node = {
    name: getUniqueName("temp"),
    image,
    fullCommand: fullCommand + " && " + WAIT_UNTIL_SCRIPT_SUFIX, // leave the pod runnig until we finish transfer files
    chain,
    validator: false,
    bootnodes: [],
    args: [],
    env: [],
    telemetryUrl: "",
    overrides: [],
  };

  return node;
}
