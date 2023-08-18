import {
  CommonParachainConfig,
  HrmpChannelsConfig,
  NodeCommonTypes,
  NodeConfig,
  ObjectJSON,
  Override,
  Parachain,
  Resources,
  SubstrateCliArgsVersion,
  Node,
  DelayNetworkSettings,
} from "./sharedTypes";

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

export interface RelayChainConfig {
  default_command?: string;
  default_image?: string;
  default_resources?: Resources;
  default_db_snapshot?: string;
  default_prometheus_prefix?: string;
  default_substrate_cli_args_version?: SubstrateCliArgsVersion;
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
  default_delay_network_settings?: DelayNetworkSettings;
}

export interface ComputedNetwork {
  settings: Settings;
  relaychain: {
    defaultImage: string;
    defaultCommand: string;
    defaultArgs: string[];
    defaultDbSnapshot?: string;
    defaultPrometheusPrefix: string;
    chain: string;
    chainSpecPath?: string;
    chainSpecCommand?: string;
    randomNominatorsCount: number;
    maxNominations: number;
    nodes: Node[];
    overrides: Override[];
    genesis?: JSON | ObjectJSON;
    defaultResources?: Resources;
    delayNetworkSettings?: DelayNetworkSettings;
  };
  parachains: Parachain[];
  types: any;
  hrmp_channels?: HrmpChannelsConfig[];
  configBasePath: string;
  seed: string;
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
  global_delay_network_global_settings?: DelayNetworkSettings;
}

export interface GlobalVolume {
  name: string;
  fs_type: string;
  mount_path: string;
}

export interface ParachainConfig extends CommonParachainConfig {
  add_to_genesis?: boolean;
  register_para?: boolean;
  onboard_as_parachain?: boolean;
  genesis_wasm_path?: string;
  genesis_wasm_generator?: string;
  genesis_state_path?: string;
  genesis_state_generator?: string;
  chain_spec_path?: string;
  cumulus_based?: boolean;
  bootnodes?: string[];
  prometheus_prefix?: string;
  // backward compatibility
  collator?: NodeConfig;
  collators?: NodeConfig[];
  collator_groups?: NodeGroupConfig[];
}

export interface NodeGroupConfig extends NodeCommonTypes {
  image?: string;
  count: string | number;
  delay_network_settings?: DelayNetworkSettings;
}
