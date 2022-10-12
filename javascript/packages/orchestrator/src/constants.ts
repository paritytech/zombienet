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

const DEFAULT_GLOBAL_TIMEOUT = 1200; // 20 mins
const DEFAULT_INDIVIDUAL_TEST_TIMEOUT = 10; // seconds
const DEFAULT_COMMAND = "polkadot";
const DEFAULT_IMAGE = "parity/substrate:latest";
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
const DEFAULT_CUMULUS_COLLATOR_BIN = "polkadot-parachain";
const DEFAULT_COLLATOR_IMAGE = "paritypr/colander:4131-e5c7e975";
const DEFAULT_MAX_NOMINATIONS = 24; // kusama value is 24
const FINISH_MAGIC_FILE = "/tmp/finished.txt";
const GENESIS_STATE_FILENAME = "genesis-state";
const GENESIS_WASM_FILENAME = "genesis-wasm";

const TMP_DONE = "echo done > /tmp/zombie-tmp-done";
const WAIT_UNTIL_SCRIPT_SUFIX = `until [ -f ${FINISH_MAGIC_FILE} ]; do echo waiting for copy files to finish; sleep 1; done; echo copy files has finished`;
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

const AVAILABLE_PROVIDERS = ["podman", "kubernetes", "native"];
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
  "listen-addr": 2,
  d: 2,
  "base-path": 2,
};

export {
  REGULAR_BIN_PATH,
  PROMETHEUS_PORT,
  RPC_WS_PORT,
  RPC_HTTP_PORT,
  P2P_PORT,
  DEFAULT_PORTS,
  DEFAULT_GLOBAL_TIMEOUT,
  DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
  DEFAULT_COMMAND,
  DEFAULT_IMAGE,
  DEFAULT_ARGS,
  DEFAULT_CHAIN,
  DEFAULT_BOOTNODE_PEER_ID,
  DEFAULT_BOOTNODE_DOMAIN,
  DEFAULT_REMOTE_DIR,
  DEFAULT_DATA_DIR,
  DEFAULT_CHAIN_SPEC,
  DEFAULT_CHAIN_SPEC_RAW,
  DEFAULT_CHAIN_SPEC_COMMAND,
  DEFAULT_GENESIS_GENERATE_SUBCOMMAND,
  DEFAULT_WASM_GENERATE_SUBCOMMAND,
  DEFAULT_ADDER_COLLATOR_BIN,
  DEFAULT_CUMULUS_COLLATOR_BIN,
  DEFAULT_COLLATOR_IMAGE,
  DEFAULT_MAX_NOMINATIONS,
  FINISH_MAGIC_FILE,
  GENESIS_STATE_FILENAME,
  GENESIS_WASM_FILENAME,
  TMP_DONE,
  WAIT_UNTIL_SCRIPT_SUFIX,
  TRANSFER_CONTAINER_NAME,
  ZOMBIE_BUCKET,
  WS_URI_PATTERN,
  METRICS_URI_PATTERN,
  LOCALHOST,
  BAKCCHANNEL_URI_PATTERN,
  BAKCCHANNEL_PORT,
  BAKCCHANNEL_POD_NAME,
  INTROSPECTOR_PORT,
  INTROSPECTOR_POD_NAME,
  TRACING_COLLATOR_NAME,
  TRACING_COLLATOR_SERVICE,
  TRACING_COLLATOR_NAMESPACE,
  TRACING_COLLATOR_PODNAME,
  TRACING_COLLATOR_PORT,
  ZOMBIE_WRAPPER,
  AVAILABLE_PROVIDERS,
  DEFAULT_PROVIDER,
  DEV_ACCOUNTS,
  DEFAULT_BALANCE,
  ARGS_TO_REMOVE,
};
