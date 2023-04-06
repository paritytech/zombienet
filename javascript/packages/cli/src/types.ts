import type { HrmpChannelsConfig, ObjectJSON } from "@zombienet/orchestrator";

// Config interfaces
export interface PL_NodesConfig {
  name: string;
  wsPort: number;
  port: number;
  flags?: [string];
}

export interface PL_RelayChainConfig {
  bin?: string;
  chain: string;
  nodes: [PL_NodesConfig];
  genesis?: JSON | ObjectJSON;
}

export interface PL_ParaChainConfig {
  bin?: string;
  name?: string;
  id: number;
  port?: string;
  balance?: string;
  nodes: [PL_NodesConfig];
}

export interface PL_ConfigType {
  relaychain?: PL_RelayChainConfig;
  parachains?: [PL_ParaChainConfig];
  simpleParachains?: [PL_NodesConfig & { id: number }];
  hrmpChannels?: HrmpChannelsConfig[];
  types?: any;
  finalization?: boolean;
}
