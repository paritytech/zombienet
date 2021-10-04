export interface KubectlResponse {
  exitCode: number;
  stdout: string;
}

// Computed Network (internal use)
export interface ComputedNetwork {
  settings: Settings,
  relaychain: {
    defaultImage: string,
    chain: string,
    chainSpecPath?: string,
    chainSpecCommand?: string,
    nodes: Node[]
  },
  parachains: Parachain[]
}


export interface Node {
  name: string;
  command?: string;
  commandWithArgs?: string;
  image: string;
  chain: string;
  chainSpec?: string; // path to the json spec
  port?: number;
  wsPort?: number;
  validator: boolean;
  args: string[];
  env: envVars[];
  bootnodes: string[];
  substrateRole?: string;
  initContainers?: object[];
  autoConnectApi: boolean;
  // command: Option<String>,
  // command_with_args: Option<String>,
  // subcommand: Option<String>,
  // init: Option<CustomInit>,
  // extra_args: Option<Vec<String>>,
  // validator: Option<bool>,
  // chain_name: Option<String>,
  // binary: Option<PathBuf>,
  // chain_spec: Option<String>,
  // keys: Option<Vec<KeyToInsert>>,
  // image: Option<String>,
  // volumes: Option<Vec<NodeVolume>>,
  // timeout: Option<u16>,
  // resources: Option<ResourceRequirements>,
  // copy_files: Option<Vec<PathBuf>>,
  // fetch_files: Option<Vec<PathBuf>>,
  // env: Option<HashMap<String, String>>,
  // mdns: Option<bool>,

}

export interface Collator {
  name: string;
  command: string;
  commandWithArgs?: string;
  image: string;
  chain: string;
  args: string[];
  env: envVars[];
  bootnodes: string[];
  substrateRole: string;
}

export interface Parachain {
  id: number;
  genesisWasmPath?: string;
  genesisWasmGenerator?: string;
  genesisStatePath?: string;
  genesisStateGenerator?: string;
  balance?: number;
  collator: Collator
}

export interface CollatorNodeConfig {
  image?: string;
  command?: string;
  commandWithArgs? :string;
  name?: string;
  args?: string[];
  initContainers?: object[];
}



export interface envVars {
  name: string;
  value: string;
}

// Launch Config ( user provided config )
export interface LaunchConfig {
  settings?: Settings;
  relaychain: RelayChainConfig;
  parachains: ParachainConfig[];
}

export interface Settings {
  init_containers: InitContainer[];
  global_volumes: GlobalVolume[];
  bootnode: boolean;
  bootnode_domain?: string;
  timeout: number;
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
  nodes: {
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
    autoConnectApi?: boolean;
  }[];
}

export interface ParachainConfig {
  id: number;
  balance?: number;
  genesis_wasm_path?: string;
  genesis_wasm_generator?: string;
  genesis_state_path?: string;
  genesis_state_generator?: string;
  bootnodes?: string[],
  collator: {
    image?: string;
    command?: string;
    commandWithArgs? :string;
    name?: string;
    args?: string[];
  };
}