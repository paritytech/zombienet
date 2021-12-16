import {
  PROMETHEUS_PORT,
  FINISH_MAGIC_FILE,
  TRANSFER_CONTAINER_NAME,
  DEFAULT_COMMAND,
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
        "app.kubernetes.io/name" : namespace,
        "app.kubernetes.io/instance" : "bootnode",
        role: "bootnode",
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

export function genPodDef(namespace: string, nodeSetup: Node): any {
  const [volume_mounts, devices] = make_volume_mounts();
  const container = make_main_container(nodeSetup, volume_mounts);
  const transferContainter = make_transfer_containter();

  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: nodeSetup.name,
      labels: {
        role: nodeSetup.validator ? "authority" : "full-node",
        app: "zombienet",
        "app.kubernetes.io/name" : namespace,
        "app.kubernetes.io/instance" : nodeSetup.name,
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
    image: "alpine",
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
  ];

  const devices = [{ name: "tmp-cfg" }];

  return [volume_mounts, devices];
}

function make_main_container(nodeSetup: Node, volume_mounts: any[]): any {
  const ports = [{ containerPort: PROMETHEUS_PORT }];
  const command = gen_cmd(nodeSetup);

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

function gen_cmd(nodeSetup: Node): string[] {
  let {
    name,
    chain,
    commandWithArgs,
    fullCommand,
    command,
    telemetry,
    telemetryUrl,
    prometheus,
    validator,
    bootnodes,
    args,
  } = nodeSetup;

  if (fullCommand) return ["bash", "-c", fullCommand];

  if (commandWithArgs) {
    const parts = commandWithArgs.split(" ");
    let finalCommand: string[] = [];
    if (["bash", "ash"].includes(parts[0])) {
      finalCommand.push(parts[0]);
      let partIndex;
      if (parts[1] === "-c") {
        finalCommand.push(parts[1]);
        partIndex = 2;
      } else {
        finalCommand.push("-c");
        partIndex = 1;
      }
      finalCommand = [...finalCommand, ...[parts.slice(partIndex).join(" ")]];
    } else {
      finalCommand = ["bash", "-c", commandWithArgs];
    }

    return finalCommand;
  }

  // if (!mdns) args.push("--no-mdns");
  args.push("--no-mdns");

  if (!telemetry) args.push("--no-telemetry");
  else args.push("--telemetry-url", telemetryUrl);

  if (prometheus) args.push("--prometheus-external");

  if (validator) args.push("--validator");

  if (bootnodes && bootnodes.length)
    args.push("--bootnodes", bootnodes.join(","));
  // args.extend(self.custom_args.iter().cloned());

  // if self.chainspec.is_some() || self.substrate_binary.is_some() || self.keys.is_some() {
  //     args = if self.keys.is_some() {
  //         let keys = self.keys.as_ref().expect("None is checked");
  //         let mut insert_cmds: Vec<String> = Vec::new();
  //         for key in keys {
  //             if let Some(ref key_scheme) = key.key_scheme {
  //                 insert_cmds.push(
  //                     format!(
  //                         "{} key insert --chain {} --suri {} --scheme {} --key-type {};",
  //                         self.cmd,
  //                         self.chain_name,
  //                         key.key,
  //                         key_scheme,
  //                         key.key_type,
  //                     )
  //                 );
  //             } else {
  //                 insert_cmds.push(
  //                     format!(
  //                         "{} key insert --chain {} --suri {} --key-type {};",
  //                         self.cmd,
  //                         self.chain_name,
  //                         key.key,
  //                         key.key_type
  //                     )
  //                 );
  //             }
  //         }
  //         insert_cmds.extend_from_slice(&args);
  //         insert_cmds
  //     } else {
  //         args
  //     };
  // }

  if (!command) command = DEFAULT_COMMAND;
  const finalArgs: string[] = [
    command,
    "--chain",
    `/cfg/${chain}.json`,
    "--name",
    name,
    "--rpc-cors",
    "all",
    // "--unsafe-rpc-external",
    // "--rpc-methods",
    // "unsafe",
    // "--unsafe-ws-external",
    ...args,
  ];

  //DEBUG
  // return ["bash", "-c", finalArgs.join(" ")  ];
  return ["/cfg/zombie-wrapper.sh", finalArgs.join(" ")];
}
