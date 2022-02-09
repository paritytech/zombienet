// CONSTANTS

// Substrate binary
export const REGULAR_BIN_PATH = "substrate";
// The remote port prometheus can be accessed with
export const PROMETHEUS_PORT = 9615;
// The remote port websocket to access the RPC
export const RPC_WS_PORT = 9933;
// The remote port http to access the RPC
export const RPC_HTTP_PORT = 9944;
// The port substrate listens for p2p connections on
export const P2P_PORT = 30333;

export const DEFAULT_GLOBAL_TIMEOUT = 1200; // 20 mins
export const DEFAULT_INDIVIDUAL_TEST_TIMEOUT = 10; // seconds
export const DEFAULT_COMMAND = "polkadot";
export const DEFAULT_IMAGE = "parity/substrate:latest";
export const DEFAULT_ARGS: string[] = [];
export const DEFAULT_CHAIN = "rococo-local";
export const DEFAULT_BOOTNODE_PEER_ID =
  "12D3KooWEyoppNCUx8Yx66oV9fJnriXwCcXwDDUA2kj6vnc6iDEp";
export const DEFAULT_BOOTNODE_DOMAIN = "bootnode";
export const DEFAULT_REMOTE_DIR = "/cfg";
export const DEFAULT_DATA_DIR = "/data";
export const DEFAULT_CHAIN_SPEC = "{{chainName}}-plain.json";
export const DEFAULT_CHAIN_SPEC_RAW = "{{chainName}}-raw.json";
export const DEFAULT_CHAIN_SPEC_COMMAND =
  "{{DEFAULT_COMMAND}} build-spec --chain {{chainName}} --disable-default-bootnode";
export const DEFAULT_GENESIS_GENERATE_SUBCOMMAND ="export-genesis-state";
export const DEFAULT_WASM_GENERATE_SUBCOMMAND = "export-genesis-wasm";
export const DEFAULT_ADDER_COLLATOR_BIN = "adder-collator";
export const DEFAULT_CUMULUS_COLLATOR_BIN = "polkadot-collator";
export const DEFAULT_COLLATOR_IMAGE = "paritypr/colander:4131-e5c7e975";
export const FINISH_MAGIC_FILE = "/tmp/finished.txt";
export const GENESIS_STATE_FILENAME = "genesis-state";
export const GENESIS_WASM_FILENAME = "genesis-wasm";

export const WAIT_UNTIL_SCRIPT_SUFIX = `until [ -f ${FINISH_MAGIC_FILE} ]; do echo waiting for copy files to finish; sleep 1; done; echo copy files has finished`;
export const TRANSFER_CONTAINER_NAME = "transfer-files-container";
export const ZOMBIE_BUCKET = "zombienet-logs";
export const WS_URI_PATTERN = "ws://127.0.0.1:{{PORT}}";
export const METRICS_URI_PATTERN = "http://127.0.0.1:{{PORT}}/metrics";
export const BAKCCHANNEL_URI_PATTERN = "http://127.0.0.1:{{PORT}}";
export const BAKCCHANNEL_PORT = 3000;
export const BAKCCHANNEL_POD_NAME = "backchannel";

export const ZOMBIE_WRAPPER = "zombie-wrapper.sh";

export const LOKI_URL_FOR_NODE =
  "https://grafana.parity-mgmt.parity.io/explore?orgId=1&left=%5B%22now-3h%22,%22now%22,%22loki.parity-zombienet%22,%7B%22expr%22:%22%7Bpod%3D~%5C%22{{namespace}}%2F{{podName}}%5C%22%7D%22,%22refId%22:%22A%22,%22range%22:true%7D%5D";

export const AVAILABLE_PROVIDERS = ["podman", "kubernetes", "native"];
export const DEV_ACCOUNTS = ["alice", "bob", "charlie", "dave", "eve", "ferdie", "one", "two"];