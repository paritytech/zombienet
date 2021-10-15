import { PROMETHEUS_PORT } from "../../configManager";
import { KubeClient } from "./kubeClient";
import { Node } from "../../types";

export async function genBootnodeDef(
  client: KubeClient,
  nodeSetup: Node
): Promise<any> {
  const container = await make_main_container(nodeSetup, []);
  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: "bootnode",
      labels: {
        "node-role": "bootnode",
        app: "substrate",
      },
    },
    spec: {
      hostname: "bootnode",
      containers: [container],
      restartPolicy: "OnFailure",
    },
  };
}

export async function genPodDef(
  client: KubeClient,
  nodeSetup: Node
): Promise<any> {
  const [volume_mounts, devices] = await make_volume_mounts();
  const container = await make_main_container(nodeSetup, volume_mounts);

  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: nodeSetup.name,
      labels: {
        "node-role": nodeSetup.validator ? "validator" : "full-node",
        app: "substrate",
      },
      annotations: {
        "prometheus.io/scrape": "true",
        "prometheus.io/port": PROMETHEUS_PORT + "", //force string
      },
    },
    spec: {
      hostname: nodeSetup.name,
      containers: [container],
      initContainers: nodeSetup.initContainers || [],
      restartPolicy: "OnFailure",
      volumes: devices,
    },
  };
}

async function make_volume_mounts(): Promise<[any, any]> {
  const volume_mounts = [
    { name: "tmp-cfg", mountPath: "/cfg", readOnly: false },
  ];

  const devices = [{ name: "tmp-cfg" }];

  return [volume_mounts, devices];
}

async function make_main_container(
  nodeSetup: Node,
  volume_mounts: any[]
): Promise<any> {
  const ports = [{ containerPort: PROMETHEUS_PORT }];
  const command = await gen_cmd(nodeSetup);

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

async function gen_cmd(nodeSetup: Node): Promise<string[]> {
  let {
    name,
    chain,
    commandWithArgs,
    command,
    telemetry,
    telemetryUrl,
    prometheus,
    validator,
    bootnodes,
    args,
  } = nodeSetup;

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

  const finalaArgs = [
    command,
    "--chain",
    chain,
    "--name",
    name,
    "--rpc-cors",
    "all",
    "--unsafe-rpc-external",
    "--rpc-methods",
    "unsafe",
    "--unsafe-ws-external",
    ...args,
  ];

  return ["bash", "-c", finalaArgs.join(" ")];
}
