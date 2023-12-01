import { CHAIN } from "./chain-decorators";

export enum SubstrateCliArgsVersion {
  // Includes the --ws-port flag.
  V0 = 0,
  V1 = 1,
  // Includes the --insecure-validator-i-know-what-i-do flag.
  V2 = 2,
}

// enums
export enum ZombieRole {
  Temp = "temp",
  Node = "node",
  BootNode = "bootnode",
  Collator = "collator",
  CumulusCollator = "cumulus-collator",
}

export interface HrmpChannelsConfig {
  sender: number;
  recipient: number;
  max_capacity: number;
  max_message_size: number;
}

export type ZombieRoleLabel = ZombieRole | "authority" | "full-node";

export interface Override {
  local_path: string;
  remote_name: string;
}

export interface ObjectJSON {
  [key: string]: ObjectJSON | number | string;
}

export interface Parachain extends CommonParachainConfig {
  name: string;
  para: CHAIN;
  addToGenesis: boolean;
  registerPara: boolean;
  onboardAsParachain: boolean;
  cumulusBased: boolean;
  genesisWasmPath?: string;
  genesisWasmGenerator?: string;
  genesisStatePath?: string;
  genesisStateGenerator?: string;
  chainSpecPath?: string;
  chainSpecCommand?: string;
  specPath?: string;
  wasmPath?: string;
  statePath?: string;
  defaultSubstrateCliArgsVersion?: SubstrateCliArgsVersion;
  collators: Node[];
}

export interface Node extends NodeCommonTypes, Ports {
  image: string;
  key?: string;
  accounts?: any;
  balance?: bigint;
  command?: string;
  commandWithArgs?: string;
  fullCommand?: string;
  chain: string;
  chainSpec?: string;
  validator: boolean;
  invulnerable: boolean;
  args: string[];
  env: envVars[];
  bootnodes: string[];
  zombieRole: ZombieRole;
  group?: string;
  telemetry?: boolean;
  telemetryUrl: string;
  prometheus?: boolean;
  prometheusPrefix?: string;
  overrides: Override[];
  addToBootnodes?: boolean;
  resources?: Resources;
  parachainId?: number;
  jaegerUrl?: string;
  p2pCertHash?: string;
  imagePullPolicy?: "IfNotPresent" | "Never" | "Always";
  dbSnapshot?: string;
  externalPorts?: Ports;
  substrateCliArgsVersion?: SubstrateCliArgsVersion;
  delayNetworkSettings?: DelayNetworkSettings;
  keystoreKeyTypes?: string[];
}

export interface Ports {
  wsPort: number;
  rpcPort: number;
  prometheusPort: number;
  p2pPort: number;
}

export interface NodeConfig extends NodeCommonTypes {
  name: string;
  image?: string;
  command_with_args?: string;
  validator: boolean;
  invulnerable: boolean;
  balance: number;
  bootnodes?: string[];
  add_to_bootnodes?: boolean;
  ws_port?: number;
  rpc_port?: number;
  p2p_port?: number;
  prometheus_port?: number;
  p2p_cert_hash?: string; // libp2p certhash to use with webrtc transport.
  delay_network_settings?: DelayNetworkSettings;
}

export interface NodeCommonTypes {
  name: string;
  command?: string;
  args?: string[];
  env?: envVars[];
  overrides?: Override[];
  prometheus_prefix?: string;
  db_snapshot?: string;
  substrate_cli_args_version?: SubstrateCliArgsVersion;
  resources?: Resources;
  keystore_key_types?: string[];
}

export interface envVars {
  name: string;
  value: string;
}
export interface Resources {
  resources: {
    requests?: {
      memory?: string;
      cpu?: string;
    };
    limits?: {
      memory?: string;
      cpu?: string;
    };
  };
}

export interface CommonParachainConfig {
  id: number;
  chain?: string;
  genesis?: JSON | ObjectJSON;
  balance?: number;
  delayNetworkSettings?: DelayNetworkSettings;
}

export interface DelayNetworkSettings {
  latency: string;
  correlation?: string; // should be parsable as float by k8s
  jitter?: string;
}
