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

export interface LaunchConfig extends PolkadotLaunchConfig {
  config: { provider: string };
  settings: Settings;
  configBasePath: string;
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

export interface GlobalVolume {
  name: string;
  fs_type: string;
  mount_path: string;
}
