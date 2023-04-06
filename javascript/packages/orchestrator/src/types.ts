// Launch Config, there are used user-input
// mapped from the json/toml to compute the

import { PARA } from "./paras-decorators";

// network config to spawn.
export interface LaunchConfig extends PolkadotLaunchConfig {
  config: { provider: string };
  settings: Settings;
  configBasePath: string;
}

export interface PolkadotLaunchConfig {
  relaychain: RelayChainConfig;
  parachains: ParachainConfig[];
  types: any;
  hrmp_channels?: HrmpChannelsConfig[];
}

export interface Settings {
  global_volumes?: GlobalVolume[];
  bootnode?: boolean;
  bootnode_domain?: string;
  timeout: number;
  node_spawn_timeout?: number;
  grafana?: boolean;
  telemetry?: boolean;
  prometheus?: boolean;
  jaeger_agent?: string; // agent or collator
  tracing_collator_url?: string; // collator query url
  tracing_collator_service_name?: string; // only used by k8s provider and if not set the `url`
  tracing_collator_service_namespace?: string; // only used by k8s provider and if not set the `url`
  tracing_collator_service_port?: number; // only used by k8s provider and if not set the `url`
  enable_tracing?: boolean;
  provider: string;
  polkadot_introspector?: boolean;
  backchannel?: boolean; // only used in k8s at the moment, spawn a backchannel instance
  image_pull_policy?: "IfNotPresent" | "Never" | "Always";
  local_ip?: string; // ip used for expose local services (rpc/metrics/monitors)
}

export interface RelayChainConfig {
  default_command?: string;
  default_image?: string;
  default_resources?: Resources;
  default_db_snapshot?: string;
  chain: string;
  chain_spec_path?: string;
  chain_spec_command?: string;
  default_args?: string[];
  default_overrides?: Override[];
  random_nominators_count?: number;
  max_nominations?: number;
  nodes?: NodeConfig[];
  node_groups?: NodeGroupConfig[];
  total_node_in_groups?: number;
  genesis?: JSON | ObjectJSON;
}

export interface NodeConfig {
  name: string;
  image?: string;
  command?: string;
  command_with_args?: string;
  args?: string[];
  validator: boolean;
  invulnerable: boolean;
  balance: number;
  env?: envVars[];
  bootnodes?: string[];
  overrides?: Override[];
  add_to_bootnodes?: boolean;
  resources?: Resources;
  ws_port?: number;
  rpc_port?: number;
  prometheus_port?: number;
  p2p_port?: number;
  db_snapshot?: string;
  p2p_cert_hash?: string; // libp2p certhash to use with webrtc transport.
}

export interface NodeGroupConfig {
  name: string;
  image?: string;
  command?: string;
  args?: string[];
  env?: envVars[];
  overrides?: Override[];
  count: string | number;
  resources?: Resources;
  db_snapshot?: string;
}

export interface ParachainConfig {
  id: number;
  chain?: string;
  add_to_genesis?: boolean;
  register_para?: boolean;
  onboard_as_parachain?: boolean;
  balance?: number;
  genesis_wasm_path?: string;
  genesis_wasm_generator?: string;
  genesis_state_path?: string;
  genesis_state_generator?: string;
  chain_spec_path?: string;
  cumulus_based?: boolean;
  bootnodes?: string[];
  // backward compatibility
  collator?: NodeConfig;
  collators?: NodeConfig[];
  collator_groups?: NodeGroupConfig[];
  genesis?: JSON | ObjectJSON;
}

export interface HrmpChannelsConfig {
  sender: number;
  recipient: number;
  max_capacity: number;
  max_message_size: number;
}

// Computed Network
export interface ComputedNetwork {
  settings: Settings;
  relaychain: {
    defaultImage: string;
    defaultCommand: string;
    defaultArgs: string[];
    defaultDbSnapshot?: string;
    chain: string;
    chainSpecPath?: string;
    chainSpecCommand?: string;
    randomNominatorsCount: number;
    maxNominations: number;
    nodes: Node[];
    overrides: Override[];
    genesis?: JSON | ObjectJSON;
    defaultResources?: Resources;
  };
  parachains: Parachain[];
  types: any;
  hrmp_channels?: HrmpChannelsConfig[];
  configBasePath: string;
  seed: string;
}

export interface Node {
  name: string;
  key?: string;
  accounts?: any;
  balance?: number;
  command?: string;
  commandWithArgs?: string;
  fullCommand?: string;
  image: string;
  chain: string;
  chainSpec?: string;
  validator: boolean;
  invulnerable: boolean;
  args: string[];
  env: envVars[];
  bootnodes: string[];
  zombieRole: "temp" | "node" | "bootnode" | "collator" | "cumulus-collator";
  group?: string;
  telemetry?: boolean;
  telemetryUrl: string;
  prometheus?: boolean;
  overrides: Override[];
  addToBootnodes?: boolean;
  resources?: Resources;
  parachainId?: number;
  jaegerUrl?: string;
  wsPort: number;
  rpcPort: number;
  prometheusPort: number;
  p2pPort: number;
  p2pCertHash?: string;
  imagePullPolicy?: "IfNotPresent" | "Never" | "Always";
  dbSnapshot?: string;
  externalPorts?: {
    wsPort: number;
    rpcPort: number;
    prometheusPort: number;
    p2pPort: number;
  };
}

export interface Collator {
  name: string;
  command: string;
  commandWithArgs?: string;
  image: string;
  chain?: string;
  args: string[];
  env: envVars[];
  bootnodes: string[];
  count?: number;
}

export interface Parachain {
  id: number;
  name: string;
  chain?: string;
  para: PARA;
  addToGenesis: boolean;
  registerPara: boolean;
  onboardAsParachain: boolean;
  cumulusBased: boolean;
  genesisWasmPath?: string;
  genesisWasmGenerator?: string;
  genesisStatePath?: string;
  genesisStateGenerator?: string;
  chainSpecPath?: string;
  specPath?: string;
  wasmPath?: string;
  statePath?: string;
  balance?: number;
  collators: Node[];
  genesis?: JSON | ObjectJSON;
}

export interface envVars {
  name: string;
  value: string;
}

export interface ChainSpec {
  name: string;
  id: string;
  chainType: string;
  bootNodes: string[];
  telemetryEndpoints: null;
  protocolId: string;
  properties: null;
  forkBlocks: null;
  badBlocks: null;
  consensusEngine: null;
  lightSyncState: null;
  genesis: {
    runtime: any; // this can change depending on the versions
    raw: {
      top: {
        [key: string]: string;
      };
    };
  };
}

// Utils
export interface GlobalVolume {
  name: string;
  fs_type: string;
  mount_path: string;
}

export interface fileMap {
  localFilePath: string;
  remoteFilePath: string;
  unique?: boolean;
}

export interface Override {
  local_path: string;
  remote_name: string;
}

export interface ObjectJSON {
  [key: string]: ObjectJSON | number | string;
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

export interface MultiAddressByNode {
  [key: string]: string;
}

export interface TestDefinition {
  network: string;
  creds: string;
  description?: string;
  assertions: Assertion[];
}

export interface Assertion {
  original_line: string;
  parsed: {
    fn: string;
    args: FnArgs;
  };
}

export interface FnArgs {
  node_name?: string;
  para_id?: number;
  timeout?: number;
  target_value?: number;
  metric_name?: string;
  buckets?: string[];
  span_id?: string;
  op?: string;
  pattern?: string;
  match_type?: string;
  file_path?: string;
  custom_args?: string;
  file_or_uri?: string;
  after?: number;
  seconds?: number;
}

export interface RegisterParachainOptions {
  id: number;
  wasmPath: string;
  statePath: string;
  apiUrl: string;
  onboardAsParachain: boolean;
  seed?: string;
  finalization?: boolean;
}
