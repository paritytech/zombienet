#!/usr/bin/env node

import axios from "axios";
import { Command, Option } from "commander";
import fs from "fs";
import path, { resolve } from "path";
import progress from "progress";
import { Network } from "./network";
import { start } from "./orchestrator";
import { run } from "./test-runner";
import {
  LaunchConfig,
  NodeConfig,
  ParachainConfig,
  PL_ConfigType,
  PolkadotLaunchConfig,
} from "./types";
import { askQuestion, getCredsFilePath, readNetworkConfig } from "./utils/fs";

import {
  AVAILABLE_PROVIDERS,
  DEFAULT_BALANCE,
  DEFAULT_GLOBAL_TIMEOUT,
  DEFAULT_PROVIDER,
} from "./constants";
const DEFAULT_CUMULUS_COLLATOR_URL =
  "https://github.com/paritytech/cumulus/releases/download/v0.9.270/polkadot-parachain";
// const DEFAULT_ADDER_COLLATOR_URL =
//   "https://gitlab.parity.io/parity/mirrors/polkadot/-/jobs/1769497/artifacts/raw/artifacts/adder-collator";
import { decorators } from "./utils/colors";
import { convertBytes, getFilePathNameExt } from "./utils/misc";

interface OptIf {
  [key: string]: { name: string; url?: string; size?: string };
}

const options: OptIf = {
  "polkadot-parachain": {
    name: "polkadot-parachain",
    url: DEFAULT_CUMULUS_COLLATOR_URL,
    size: "120",
  },
  // // Deactivate for now
  // adderCollator: {
  //   name: "adderCollator",
  //   url: DEFAULT_ADDER_COLLATOR_URL,
  //   size: "950",
  // },
};

const debug = require("debug")("zombie-cli");

const program = new Command("zombienet");

let network: Network;

// Download the binaries
const downloadBinaries = async (binaries: string[]): Promise<void> => {
  console.log(`${decorators.yellow("\nStart download...\n")}`);
  const promises = [];
  let count = 0;
  for (let binary of binaries) {
    promises.push(
      new Promise<void>(async (resolve) => {
        const { url, name } = options[binary];
        const { data, headers } = await axios({
          url,
          method: "GET",
          responseType: "stream",
        });
        const totalLength = headers["content-length"];

        const progressBar = new progress(
          "-> downloading [:bar] :percent :etas",
          {
            width: 40,
            complete: "=",
            incomplete: " ",
            renderThrottle: 1,
            total: parseInt(totalLength),
          },
        );

        const writer = fs.createWriteStream(path.resolve(__dirname, name));

        data.on("data", (chunk: any) => progressBar.tick(chunk.length));
        data.pipe(writer);
        data.on("end", () => {
          console.log(decorators.yellow(`Binary "${name}" downloaded`));
          // Add permissions to the binary
          console.log(decorators.cyan(`Giving permissions to "${name}"`));
          fs.chmodSync(path.resolve(__dirname, name), 0o755);
          resolve();
        });
      }),
    );
  }
  await Promise.all(promises);
  console.log(
    decorators.cyan(`Please add the dir to your $PATH by running the command:`),
    decorators.blue(`export PATH=${__dirname}:$PATH`),
  );
};

// Retrieve the latest release for polkadot
const latestPolkadotReleaseURL = async (
  repo: string,
  name: string,
): Promise<[string, string]> => {
  try {
    const res = await axios.get(
      `https://api.github.com/repos/paritytech/${repo}/releases/latest`,
    );
    const obj = res.data.assets.filter((a: any) => a.name === name);
    return [
      `https://github.com/paritytech/${repo}/releases/download/${res.data.tag_name}/${name}`,
      convertBytes(obj[0].size),
    ];
  } catch (err: any) {
    if (err.code === "ENOTFOUND") {
      throw new Error("Network error.");
    } else if (err.response && err.response.status === 404) {
      throw new Error("Could not find a release.");
    }
    throw new Error(err);
  }
};

// Convert functions
// Read the input file
async function readInputFile(
  ext: string,
  fPath: string,
): Promise<PL_ConfigType> {
  let json: object;
  if (ext === "json" || ext === "js") {
    json =
      ext === "json"
        ? JSON.parse(fs.readFileSync(`${fPath}`, "utf8"))
        : await import(path.resolve(fPath));
  } else {
    throw Error("No valid extension was found.");
  }
  return json;
}

async function convertInput(filePath: string) {
  const { fullPath, fileName, extension } = getFilePathNameExt(filePath);

  const convertedJson = await readInputFile(extension, filePath);

  const { relaychain, parachains, simpleParachains, hrmpChannels, types } =
    convertedJson;

  let jsonOutput: PolkadotLaunchConfig;
  const nodes: NodeConfig[] = [];
  const paras: ParachainConfig[] = [];
  let collators: NodeConfig[] = [];

  const DEFAULT_NODE_VALUES = {
    validator: true,
    invulnerable: true,
    balance: DEFAULT_BALANCE,
  };

  parachains &&
    parachains.forEach((parachain) => {
      collators = [];
      parachain.nodes.forEach((n) => {
        collators.push({
          name: n.name,
          command: "adder-collator",
          ...DEFAULT_NODE_VALUES,
        });
      });
      paras.push({
        id: parachain.id,
        collators,
      });
    });

  collators = [];

  simpleParachains &&
    simpleParachains.forEach((sp) => {
      collators.push({
        name: sp.name,
        command: "adder-collator",
        ...DEFAULT_NODE_VALUES,
      });
      paras.push({
        id: sp.id,
        collators,
      });
    });

  if (relaychain?.nodes) {
    relaychain.nodes.forEach((n) => {
      nodes.push({
        name: `"${n.name}"`,
        ...DEFAULT_NODE_VALUES,
      });
    });
  }

  jsonOutput = {
    relaychain: {
      default_image: "docker.io/paritypr/polkadot-debug:master",
      default_command: "polkadot",
      default_args: ["-lparachain=debug"],
      chain: relaychain?.chain || "",
      nodes,
      genesis: relaychain?.genesis,
    },
    types,
    hrmp_channels: hrmpChannels || [],
    parachains: paras,
  };

  fs.writeFile(
    `${fullPath}/${fileName}-zombienet.json`,
    JSON.stringify(jsonOutput),
    (error: any) => {
      if (error) throw error;
    },
  );
  console.log(
    `Converted JSON config exists now under: ${fullPath}/${fileName}-zombienet.json`,
  );
}

// Ensure to log the uncaught exceptions
// to debug the problem, also exit because we don't know
// what happens there.
process.on("uncaughtException", async (err) => {
  if (network) {
    debug("removing namespace: " + network.namespace);
    await network.stop();
  }
  console.log(`uncaughtException`);
  console.log(err);
  debug(err);
  process.exit(100);
});

// Ensure that we know about any exception thrown in a promise that we
// accidentally don't have a 'catch' for.
// http://www.hacksrus.net/blog/2015/08/a-solution-to-swallowed-exceptions-in-es6s-promises/
process.on("unhandledRejection", async (err) => {
  if (network) {
    debug("removing namespace: " + network.namespace);
    await network.stop();
  }
  debug(err);
  console.log(`UnhandledRejection: ${err}`);
  process.exit(1001);
});

// Handle ctrl+c to trigger `exit`.
let alreadyTry = false;
process.on("SIGINT", async function () {
  process.env.terminating = "1";
  if (network && !alreadyTry) {
    alreadyTry = true;
    const msg = "Ctrl+c ... removing namespace: " + network.namespace;
    console.log(decorators.magenta(msg));
    debug(msg);
    await network.stop();
  }
  process.exit(2);
});

process.on("exit", async function () {
  process.env.terminating = "1";
  if (network && !alreadyTry) {
    alreadyTry = true;
    debug("removing namespace: " + network.namespace);
    await network.dumpLogs();
    await network.stop();
  }
  const exitCode = process.exitCode !== undefined ? process.exitCode : 2;
  // use exitCode set by mocha or 2 as default.
  process.exit(exitCode);
});

program
  .addOption(
    new Option(
      "-c, --spawn-concurrency <concurrency>",
      "Number of concurrent spawning process to launch, default is 1",
    ),
  )
  .addOption(
    new Option("-p, --provider <provider>", "Override provider to use").choices(
      ["podman", "kubernetes", "native"],
    ),
  )
  .addOption(
    new Option(
      "-m, --monitor",
      "Start as monitor, do not auto cleanup network",
    ),
  );

program
  .command("spawn")
  .description("Spawn the network defined in the config")
  .argument("<networkConfig>", "Network config file path")
  .argument("[creds]", "kubeclt credentials file")
  .action(spawn);

program
  .command("test")
  .description("Run tests on the network defined")
  .argument("<testFile>", "Feature file describing the tests")
  .argument(
    "[runningNetworkSpec]",
    "Path to the network spec json, for using a running network for running the test",
  )
  .action(test);

program
  .command("setup")
  .description(
    "Setup is meant for downloading and making dev environment of ZombieNet ready",
  )
  .argument(
    "<binaries...>",
    `the binaries that you want to be downloaded, provided in a row without any separators;\nThey are downloaded in current directory and appropriate executable permissions are assigned.\nPossible options: 'polkadot', 'polkadot-parachain'\n${decorators.blue(
      "zombienet setup polkadot polkadot-parachain",
    )}`,
  )
  .action(setup);

program
  .command("convert")
  .description(
    "Convert is meant for transforming a (now deprecated) polkadot-launch configuration to zombienet configuration",
  )
  .argument(
    "<filePath>",
    `Expecting 1 mandatory param which is the path of the polkadot-lauch configuration file (could be either a .js or .json file).`,
  )
  .action(convert);

program
  .command("version")
  .description("Prints zombienet version")
  .action(() => {
    const p = require("../package.json");
    console.log(p.version);
    process.exit(0);
  });

/**
 * Spawn - spawns ephemeral networks, providing a simple but poweful cli that allow you to declare
 * the desired network in toml or json format.
 * Read more here: https://paritytech.github.io/zombienet/cli/spawn.html
 * @param configFile: config file, supported both json and toml formats
 * @param credsFile: Credentials file name or path> to use (Only> with kubernetes provider), we look
 *  in the current directory or in $HOME/.kube/ if a filename is passed.
 * @param _opts
 */
async function spawn(
  configFile: string,
  credsFile: string | undefined,
  _opts: any,
) {
  const opts = program.opts();
  const monitor = opts.monitor || false;
  const spawnConcurrency = opts.spawnConcurrency || 1;
  const configPath = resolve(process.cwd(), configFile);
  if (!fs.existsSync(configPath)) {
    console.error("  ⚠ Config file does not exist: ", configPath);
    process.exit();
  }

  const filePath = resolve(configFile);
  const config: LaunchConfig = readNetworkConfig(filePath);

  // set default provider and timeout if not provided
  if (!config.settings) {
    config.settings = {
      provider: DEFAULT_PROVIDER,
      timeout: DEFAULT_GLOBAL_TIMEOUT,
    };
  } else {
    if (!config.settings.provider) config.settings.provider = DEFAULT_PROVIDER;
    if (!config.settings.timeout)
      config.settings.timeout = DEFAULT_GLOBAL_TIMEOUT;
  }

  // if a provider is passed, let just use it.
  if (opts.provider && AVAILABLE_PROVIDERS.includes(opts.provider)) {
    config.settings.provider = opts.provider;
  }

  let creds = "";
  if (config.settings?.provider === "kubernetes") {
    creds = getCredsFilePath(credsFile || "config") || "";
    if (!creds) {
      console.log(
        `Running ${config.settings?.provider || DEFAULT_PROVIDER} provider:`,
      );
      console.error("  ⚠ I can't find the Creds file: ", credsFile);
      process.exit();
    }
  }

  const options = { monitor, spawnConcurrency };
  network = await start(creds, config, options);
  network.showNetworkInfo(config.settings?.provider);
}

/**
 * Test - performs test/assertions agins the spawned network, using a set of natural
 * language expressions that allow to make assertions based on metrics, logs and some
 * built-in function that query the network using polkadot.js
 * Read more here: https://paritytech.github.io/zombienet/cli/testing.html
 * @param testFile
 * @param runningNetworkSpec
 * @param _opts
 */
async function test(
  testFile: string,
  runningNetworkSpec: string | undefined,
  _opts: any,
) {
  const opts = program.opts();
  process.env.DEBUG = "zombie";
  const inCI = process.env.RUN_IN_CONTAINER === "1";
  // use `k8s` as default
  const providerToUse =
    opts.provider && AVAILABLE_PROVIDERS.includes(opts.provider)
      ? opts.provider
      : "kubernetes";
  await run(
    testFile,
    providerToUse,
    inCI,
    opts.spawnConcurrency,
    runningNetworkSpec,
  );
}

/**
 * Setup - easily download latest artifacts and make them executablein order to use them with zombienet
 * Read more here: https://paritytech.github.io/zombienet/cli/setup.html
 * @param params binaries that willbe downloaded and set up. Possible values: `polkadot` `polkadot-parachain`
 * @returns
 */
async function setup(params: any) {
  console.log(`${decorators.green("\n\n🧟🧟🧟 ZombieNet Setup 🧟🧟🧟\n\n")}`);
  if (
    ["aix", "freebsd", "openbsd", "sunos", "win32"].includes(process.platform)
  ) {
    console.log(
      "Zombienet currently supports linux and MacOS. \n Alternative, you can use k8s or podman. For more read here: https://github.com/paritytech/zombienet#requirements-by-provider",
    );
    return;
  }
  await new Promise<void>((resolve) => {
    latestPolkadotReleaseURL("polkadot", "polkadot").then(
      (res: [string, string]) => {
        options.polkadot = {
          name: "polkadot",
          url: res[0],
          size: res[1],
        };
        resolve();
      },
    );
  });

  // If the platform is MacOS then the polkadot repo needs to be cloned and run locally by the user
  // as polkadot do not release a binary for MacOS
  if (process.platform === "darwin" && params.includes("polkadot")) {
    console.log(
      `${decorators.yellow(
        "Note: ",
      )} You are using MacOS. Please, clone the polkadot repo ` +
        `${decorators.cyan("(https://github.com/paritytech/polkadot)")}` +
        ` and run it locally.\n At the moment there is no polkadot binary for MacOs.\n\n`,
    );
    const index = params.indexOf("polkadot");
    if (index !== -1) {
      params.splice(index, 1);
    }
  }

  if (params.length === 0) {
    console.log(
      `${decorators.green("No more binaries to download. Exiting...")}`,
    );
    return;
  }
  let count = 0;
  console.log("Setup will start to download binaries:");
  params.forEach((a: any) => {
    const size = parseInt(options[a]?.size || "0", 10);
    count += size;
    console.log("-", a, "\t Approx. size ", size, " MB");
  });
  console.log("Total approx. size: ", count, "MB");
  const response = await askQuestion(
    `${decorators.yellow("\nDo you want to continue? (y/n)")}`,
  );
  if (response.toLowerCase() !== "n" && response.toLowerCase() !== "y") {
    console.log("Invalid input. Exiting...");
    return;
  }
  if (response.toLowerCase() === "n") {
    return;
  }
  downloadBinaries(params);
  return;
}

async function convert(param: string) {
  try {
    const filePath = param;

    if (!filePath) {
      throw Error("Path of configuration file was not provided");
    }

    // Read through the JSON and write to stream sample
    await convertInput(filePath);
  } catch (err) {
    console.log("error", err);
  }
}

program.parse(process.argv);
