// CONSTANTS

// Substrate binary
const REGULAR_BIN_PATH = "substrate";
// The remote port prometheus can be accessed with
const PROMETHEUS_PORT = 9615;
// The remote port websocket to access the RPC
const RPC_WS_PORT = 9944;
// The remote port http to access the RPC
const RPC_HTTP_PORT = 9933;
// The port substrate listens for p2p connections on
const P2P_PORT = 30333;

const DEFAULT_PORTS = {
  p2pPort: P2P_PORT,
  wsPort: RPC_WS_PORT,
  rpcPort: RPC_HTTP_PORT,
  prometheusPort: PROMETHEUS_PORT,
};

// Jaeger agent container exposed port from:
// https://www.jaegertracing.io/docs/1.6/getting-started/#all-in-one-docker-image
const JAEGER_AGENT_ZIPKIN_COMPACT_PORT = 5775;
const JAEGER_AGENT_SERVE_CONFIGS_PORT = 5778;
const JAEGER_AGENT_THRIFT_COMPACT_PORT = 6831;
const JAEGER_AGENT_THRIFT_BINARY_PORT = 6832;

const DEFAULT_GLOBAL_TIMEOUT = 1200; // 20 mins
const DEFAULT_INDIVIDUAL_TEST_TIMEOUT = 10; // seconds
const DEFAULT_COMMAND = "polkadot";
const DEFAULT_IMAGE = "parity/polkadot:latest";
const DEFAULT_ARGS: string[] = [];
const DEFAULT_CHAIN = "rococo-local";
const DEFAULT_BOOTNODE_PEER_ID =
  "12D3KooWEyoppNCUx8Yx66oV9fJnriXwCcXwDDUA2kj6vnc6iDEp";
const DEFAULT_BOOTNODE_DOMAIN = "bootnode";
const DEFAULT_REMOTE_DIR = "/cfg";
const DEFAULT_DATA_DIR = "/data";
const DEFAULT_CHAIN_SPEC = "{{chainName}}-plain.json";
const DEFAULT_CHAIN_SPEC_RAW = "{{chainName}}-raw.json";
const DEFAULT_CHAIN_SPEC_COMMAND =
  "{{DEFAULT_COMMAND}} build-spec --chain {{chainName}} --disable-default-bootnode";
const DEFAULT_GENESIS_GENERATE_SUBCOMMAND = "export-genesis-state";
const DEFAULT_WASM_GENERATE_SUBCOMMAND = "export-genesis-wasm";
const DEFAULT_ADDER_COLLATOR_BIN = "adder-collator";
const UNDYING_COLLATOR_BIN = "undying-collator";
const DEFAULT_CUMULUS_COLLATOR_BIN = "polkadot-parachain";
const DEFAULT_COLLATOR_IMAGE = "parity/polkadot-parachain:latest";
const DEFAULT_MAX_NOMINATIONS = 24; // kusama value is 24
const DEFAULT_PROMETHEUS_PREFIX = "substrate";
const FINISH_MAGIC_FILE = "/tmp/finished.txt";
const GENESIS_STATE_FILENAME = "genesis-state";
const GENESIS_WASM_FILENAME = "genesis-wasm";

const TMP_DONE = "echo done > /tmp/zombie-tmp-done";
const TRANSFER_CONTAINER_WAIT_LOG = "waiting for tar to finish";
const NODE_CONTAINER_WAIT_LOG = "waiting for copy files to finish";
const WAIT_UNTIL_SCRIPT_SUFIX = `until [ -f ${FINISH_MAGIC_FILE} ]; do echo ${NODE_CONTAINER_WAIT_LOG}; sleep 1; done; echo copy files has finished`;
const K8S_WAIT_UNTIL_SCRIPT_SUFIX = `until [ -f ${FINISH_MAGIC_FILE} ]; do /cfg/coreutils echo "${NODE_CONTAINER_WAIT_LOG}"; /cfg/coreutils sleep 1; done; /cfg/coreutils echo "copy files has finished"`;
const TRANSFER_CONTAINER_NAME = "transfer-files-container";
const ZOMBIE_BUCKET = "zombienet-logs";
const WS_URI_PATTERN = "ws://{{IP}}:{{PORT}}";
const METRICS_URI_PATTERN = "http://{{IP}}:{{PORT}}/metrics";
const LOCALHOST = "127.0.0.1";
const BAKCCHANNEL_URI_PATTERN = "http://127.0.0.1:{{PORT}}";
const BAKCCHANNEL_PORT = 3000;
const BAKCCHANNEL_POD_NAME = "backchannel";
const INTROSPECTOR_PORT = 65432;
const INTROSPECTOR_POD_NAME = "introspector";

// Spans collator config
const TRACING_COLLATOR_NAME = "tracing_collator";
const TRACING_COLLATOR_SERVICE = "tempo-tempo-distributed-query-frontend"; // tempo installation in k8s
const TRACING_COLLATOR_NAMESPACE = "tempo"; // tempo installation in k8s
const TRACING_COLLATOR_PODNAME = "tempo"; // tempo installation in podman
const TRACING_COLLATOR_PORT = 3100;

const ZOMBIE_WRAPPER = "zombie-wrapper.sh";

const DEFAULT_PROVIDER = "kubernetes";
const DEV_ACCOUNTS = [
  "alice",
  "bob",
  "charlie",
  "dave",
  "eve",
  "ferdie",
  "one",
  "two",
];

// TODO: make this default less 0s if possible
const DEFAULT_BALANCE = 2000000000000;

const ARGS_TO_REMOVE: { [key: string]: number } = {
  alice: 1,
  bob: 1,
  charlie: 1,
  dave: 1,
  eve: 1,
  ferdie: 1,
  one: 1,
  two: 1,
  port: 2,
  "prometheus-external": 1,
  "ws-port": 2,
  "rpc-port": 2,
  "prometheus-port": 2,
  "node-key": 2,
  d: 2,
  "base-path": 2,
};

const TOKEN_PLACEHOLDER = /{{ZOMBIE:(.*?):(.*?)}}/gi;

export {
  ARGS_TO_REMOVE,
  BAKCCHANNEL_POD_NAME,
  BAKCCHANNEL_PORT,
  BAKCCHANNEL_URI_PATTERN,
  DEFAULT_ADDER_COLLATOR_BIN,
  DEFAULT_ARGS,
  DEFAULT_BALANCE,
  DEFAULT_BOOTNODE_DOMAIN,
  DEFAULT_BOOTNODE_PEER_ID,
  DEFAULT_CHAIN,
  DEFAULT_CHAIN_SPEC,
  DEFAULT_CHAIN_SPEC_COMMAND,
  DEFAULT_CHAIN_SPEC_RAW,
  DEFAULT_COLLATOR_IMAGE,
  DEFAULT_COMMAND,
  DEFAULT_CUMULUS_COLLATOR_BIN,
  DEFAULT_DATA_DIR,
  DEFAULT_GENESIS_GENERATE_SUBCOMMAND,
  DEFAULT_GLOBAL_TIMEOUT,
  DEFAULT_IMAGE,
  DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
  DEFAULT_MAX_NOMINATIONS,
  DEFAULT_PORTS,
  DEFAULT_PROMETHEUS_PREFIX,
  DEFAULT_PROVIDER,
  DEFAULT_REMOTE_DIR,
  DEFAULT_WASM_GENERATE_SUBCOMMAND,
  DEV_ACCOUNTS,
  FINISH_MAGIC_FILE,
  GENESIS_STATE_FILENAME,
  GENESIS_WASM_FILENAME,
  INTROSPECTOR_POD_NAME,
  INTROSPECTOR_PORT,
  JAEGER_AGENT_SERVE_CONFIGS_PORT,
  JAEGER_AGENT_THRIFT_BINARY_PORT,
  JAEGER_AGENT_THRIFT_COMPACT_PORT,
  JAEGER_AGENT_ZIPKIN_COMPACT_PORT,
  K8S_WAIT_UNTIL_SCRIPT_SUFIX,
  LOCALHOST,
  METRICS_URI_PATTERN,
  NODE_CONTAINER_WAIT_LOG,
  P2P_PORT,
  PROMETHEUS_PORT,
  REGULAR_BIN_PATH,
  RPC_HTTP_PORT,
  RPC_WS_PORT,
  TMP_DONE,
  TOKEN_PLACEHOLDER,
  TRACING_COLLATOR_NAME,
  TRACING_COLLATOR_NAMESPACE,
  TRACING_COLLATOR_PODNAME,
  TRACING_COLLATOR_PORT,
  TRACING_COLLATOR_SERVICE,
  TRANSFER_CONTAINER_NAME,
  TRANSFER_CONTAINER_WAIT_LOG,
  UNDYING_COLLATOR_BIN,
  WAIT_UNTIL_SCRIPT_SUFIX,
  WS_URI_PATTERN,
  ZOMBIE_BUCKET,
  ZOMBIE_WRAPPER,
};
