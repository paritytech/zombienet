#!/usr/bin/env node
import { Network } from "@zombienet/orchestrator";
import { decorators } from "@zombienet/utils";
import { Command, Option } from "commander";
import { convert } from "./actions/convert";
import { setup } from "./actions/setup";
import { spawn } from "./actions/spawn";
import { test } from "./actions/test";
import { checkNodeVersion } from "./versionCheck";

const debug = require("debug")("zombie-cli");

const program = new Command("zombienet");

let network: Network | undefined;
let alreadyTryToStop = false;

const setGlobalNetwork = (globalNetwork: Network) => {
  network = globalNetwork;
};

checkNodeVersion();

async function handleTermination(userInterrupted = false) {
  process.env.terminating = "1";
  if (network && !alreadyTryToStop) {
    alreadyTryToStop = true;
    if (userInterrupted) console.log("Ctrl+c detected...");
    debug("removing namespace: " + network.namespace);
    await network.dumpLogs();
    console.log(decorators.blue("Tearing down network..."));
    await network.stop();
  }
}

// Ensure to log the uncaught exceptions
// to debug the problem, also exit because we don't know
// what happens there.
process.on("uncaughtException", async (err) => {
  await handleTermination();
  console.log(`uncaughtException`);
  console.log(err);
  debug(err);
  process.exit(100);
});

// Ensure that we know about any exception thrown in a promise that we
// accidentally don't have a 'catch' for.
// http://www.hacksrus.net/blog/2015/08/a-solution-to-swallowed-exceptions-in-es6s-promises/
process.on("unhandledRejection", async (err) => {
  await handleTermination();
  debug(err);
  console.log(
    `\n${decorators.red("UnhandledRejection: ")} \t ${decorators.bright(
      err,
    )}\n`,
  );
  process.exit(1001);
});

// Handle ctrl+c to trigger `exit`.
process.on("SIGINT", async function () {
  await handleTermination();
  process.exit();
});

process.on("SIGTERM", async function () {
  await handleTermination();
  process.exit();
});

process.on("exit", async function () {
  await handleTermination();
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
      "-l, --logType <logType>",
      "Type of logging - defaults to 'table'",
    ).choices(["table", "text", "silent"]),
  )
  .addOption(
    new Option(
      "-d, --dir <path>",
      "Directory path for placing the network files instead of random temp one (e.g. -d /home/user/my-zombienet)",
    ),
  )
  .addOption(new Option("-f, --force", "Force override all prompt commands"));

program
  .command("spawn")
  .description("Spawn the network defined in the config")
  .argument("<networkConfig>", "Network config file path")
  .argument("[creds]", "kubeclt credentials file")
  .addOption(
    new Option(
      "-m, --monitor",
      "Start as monitor, do not auto cleanup network",
    ),
  )
  .action(asyncAction(spawn));

program
  .command("test")
  .description("Run tests on the network defined")
  .argument("<testFile>", "ZNDSL file (.zndsl) describing the tests")
  .argument(
    "[runningNetworkSpec]",
    "Path to the network spec json, for using a running network for running the test",
  )
  .action(asyncAction(test));

program
  .command("setup")
  .description(
    "Setup is meant for downloading and making dev environment of ZombieNet ready",
  )
  .argument(
    "<binaries...>",
    `the binaries that you want to be downloaded, provided in a row without any separators;\nThey are downloaded in current directory and appropriate executable permissions are assigned.\nPossible options: 'polkadot', 'polkadot-parachain'\n${decorators.blue(
      "zombienet setup polkadot polkadot-parachain",
    )}\nNote: Downloading 'polkadot' downloads also 'polkadot-prepare-worker' and 'polkadot-execute-worker'`,
  )
  .addOption(new Option("-y, --yes", "Bypass confirmation"))
  .action(asyncAction(setup));

program
  .command("convert")
  .description(
    "Convert is meant for transforming a (now deprecated) polkadot-launch configuration to zombienet configuration",
  )
  .argument(
    "<filePath>",
    `Expecting 1 mandatory param which is the path of the polkadot-lauch configuration file (could be either a .js or .json file).`,
  )
  .action(asyncAction(convert));

program
  .command("version")
  .description("Prints zombienet version")
  .action(() => {
    const p = require("../package.json");
    console.log(p.version);
    process.exit(0);
  });

program.addHelpText('after', `

Debug:
  The debug/verbose output is managed by the DEBUG environment variable, you can enable/disable specific debugging namespaces setting an space or comma-delimited names.
  $ e.g $ DEBUG=zombie, zombie::paras zombienet spawn example/0001-example.toml

  The available namespaces are:
  zombie
  zombie::chain
  zombie::cmdGenerator
  zombie::config
  zombie::helper
  zombie::js
  zombie::kube
  zombie::metrics
  zombie::native
  zombie::network
  zombie::paras
  zombie::podman
  zombie::spawner
  zombie::substrateCliArgsVersion
  zombie::test

  NOTE: wildcard (e.g.'zombie*') are supported, for advance use check https://www.npmjs.com/package/debug#wildcards
`);

program.parse(process.argv);

function asyncAction(cmd: Function) {
  return function () {
    // eslint-disable-next-line prefer-rest-params
    const args = [...arguments];
    (async () => {
      try {
        if (cmd.name == "spawn") {
          await cmd(...args, setGlobalNetwork);
        } else {
          await cmd(...args);
        }
      } catch (err) {
        console.log(
          `\n ${decorators.red("Error: ")} \t ${decorators.bright(err)}\n`,
        );
        process.exit(1);
      }
    })();
  };
}
