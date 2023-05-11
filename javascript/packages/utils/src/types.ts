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
}

export interface RelayChainConfig {
  default_command?: string;
  default_image?: string;
  default_resources?: Resources;
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
}

export interface ParachainConfig {
  id: number;
  chain?: string;
  add_to_genesis?: boolean;
  register_para?: boolean;
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

export interface envVars {
  name: string;
  value: string;
}

// Utils
export interface GlobalVolume {
  name: string;
  fs_type: string;
  mount_path: string;
}

export interface Override {
  local_path: string;
  remote_name: string;
}

interface ObjectJSON {
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
