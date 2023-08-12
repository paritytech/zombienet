// eslint-disable-next-line
export namespace PolkadotLaunch {
  export interface LaunchConfig {
    relaychain: RelayChainConfig;
    parachains: ParachainConfig[];
    simpleParachains: SimpleParachainConfig[];
    hrmpChannels: HrmpChannelsConfig[];
    types: any;
    finalization: boolean;
  }

  export interface RelayChainConfig {
    bin: string;
    chain: string;
    nodes: {
      name: string;
      basePath?: string;
      wsPort: number;
      rpcPort?: number;
      nodeKey?: string;
      port: number;
      flags?: string[];
    }[];
    genesis?: JSON | ObjectJSON;
  }

  export interface ParachainConfig {
    bin: string;
    id?: string;
    balance: string;
    chain?: string;
    nodes: ParachainNodeConfig[];
  }

  export interface ParachainNodeConfig {
    rpcPort?: number;
    wsPort: number;
    port: number;
    basePath?: string;
    name?: string;
    flags: string[];
  }

  export interface SimpleParachainConfig {
    bin: string;
    id: string;
    port: string;
    balance: string;
  }

  export interface HrmpChannelsConfig {
    sender: number;
    recipient: number;
    maxCapacity: number;
    maxMessageSize: number;
  }

  export interface CollatorOptions {
    name?: string;
    spec?: string;
    flags?: string[];
    basePath?: string;
    chain?: string;
    onlyOneParachainNode?: boolean;
  }

  export interface ObjectJSON {
    [key: string]: ObjectJSON | number | string;
  }
}
