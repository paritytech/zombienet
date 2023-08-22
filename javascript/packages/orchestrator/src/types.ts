// Launch Config, there are used user-input
// mapped from the json/toml to compute the

import { NodeCommonTypes, envVars } from "./sharedTypes";

// Types
export type NodeMultiAddress = string;

export interface Collator extends NodeCommonTypes {
  image: string;
  command: string;
  commandWithArgs?: string;
  chain?: string;
  args: string[];
  env: envVars[];
  bootnodes: string[];
  count?: number;
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

export interface fileMap {
  localFilePath: string;
  remoteFilePath: string;
  unique?: boolean;
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
  metric_name_a?: string;
  metric_name_b?: string;
  math_ops?: string;
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
  is_ts?: boolean;
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
