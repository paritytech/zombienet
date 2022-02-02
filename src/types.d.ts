// Computed Network (internal use)
export interface ComputedNetwork {
  settings: Settings;
  relaychain: {
    defaultImage: string;
    defaultCommand: string;
    chain: string;
    chainSpecPath?: string;
    chainSpecCommand?: string;
    nodes: Node[];
    overrides: Override[];
    genesis?: JSON | ObjectJSON;
  };
  parachains: Parachain[];
  types: any;
  hrmpChannels?: HrmpChannelsConfig[];
  configBasePath: string;
}

export interface Node {
  name: string;
  key?: string;
  accounts?: any;
  command?: string;
  commandWithArgs?: string;
  fullCommand?: string;
  image: string;
  chain: string;
  chainSpec?: string;
  port?: number;
  wsPort?: number;
  validator: boolean;
  args: string[];
  env: envVars[];
  bootnodes: string[];
  zombieRole?: "temp"|"node"|"bootnode"|"collator";
  initContainers?: object[];
  telemetry?: boolean;
  telemetryUrl: string;
  prometheus?: boolean;
  overrides: Override[];
  addToBootnodes?: boolean;
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
}

export interface Parachain {
  id: number;
  addToGenesis: boolean;
  genesisWasmPath?: string;
  genesisWasmGenerator?: string;
  genesisStatePath?: string;
  genesisStateGenerator?: string;
  balance?: number;
  collator: Collator;
}

export interface CollatorNodeConfig {
  image?: string;
  command?: string;
  commandWithArgs?: string;
  name?: string;
  args?: string[];
  initContainers?: object[];
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

// Launch Config ( user provided config )
export interface LaunchConfig {
  settings: Settings;
  relaychain: RelayChainConfig;
  parachains: ParachainConfig[];
  types: any;
  hrmpChannels?: HrmpChannelsConfig[];
  configBasePath: string;
}

export interface Settings {
  init_containers?: InitContainer[];
  global_volumes?: GlobalVolume[];
  bootnode?: boolean;
  bootnode_domain?: string;
  timeout: number;
  grafana?: boolean;
  telemetry?: boolean;
  prometheus?: boolean;
  provider: string;
}

export interface GlobalVolume {
  name: string;
  fs_type: string;
  mount_path: string;
}

export interface InitContainer {
  image: string;
  command: string;
}

export interface RelayChainConfig {
  default_command?: string;
  default_image?: string;
  chain: string; // rococo-local | local (TODO: move to enum)
  chain_spec_path?: string;
  chain_spec_command?: string;
  default_args?: string[];
  default_overrides?: Override[];
  nodes?: NodeConfig[];
  node_groups?: NodeGroupConfig[];
  total_node_in_groups?: number;
  genesis?: JSON | ObjectJSON;
}

export interface NodeConfig {
  name: string;
  image?: string;
  command?: string;
  commandWithArgs?: string;
  wsPort?: number;
  port?: number;
  args?: string[];
  extra_args?: string[];
  validator: boolean;
  env?: envVars[];
  bootnodes?: string[];
  initContainers?: object[];
  overrides?: Override[];
  add_to_bootnodes?: boolean;
}

export interface NodeGroupConfig {
  name: string;
  image?: string;
  command?: string;
  args?: string[];
  env?: envVars[];
  overrides?: Override[];
  count: string|number,
}


export interface ParachainConfig {
  id: number;
  addToGenesis?: boolean;
  balance?: number;
  genesis_wasm_path?: string;
  genesis_wasm_generator?: string;
  genesis_state_path?: string;
  genesis_state_generator?: string;
  bootnodes?: string[];
  collator: {
    image?: string;
    command?: string;
    commandWithArgs?: string;
    name?: string;
    args?: string[];
    env?: envVars[];
  };
}

export interface fileMap {
  localFilePath: string;
  remoteFilePath: string;
}

export interface Override {
  local_path: string;
  remote_name: string;
}

export interface HrmpChannelsConfig {
	sender: number;
	recipient: number;
	maxCapacity: number;
	maxMessageSize: number;
}

interface ObjectJSON {
	[key: string]: ObjectJSON | number | string;
}