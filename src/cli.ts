#!/usr/bin/env node

import { start } from "./orchestrator";
import { resolve } from "path";
import fs from "fs";
import { Network } from "./network";
import { getCredsFilePath, readNetworkConfig } from "./utils";
import { LaunchConfig } from "./types";
import { run } from "./test-runner";
import { Command, Option } from "commander";
import { AVAILABLE_PROVIDERS, DEFAULT_GLOBAL_TIMEOUT } from "./constants";

const debug = require("debug")("zombie-cli");

const program = new Command("zombienet");

let network: Network;

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
  console.log(`unhandledRejection`);
  console.log(err);
  process.exit(1001);
});

// Handle ctrl+c to trigger `exit`.
let alreadyTry = false;
process.on("SIGINT", async function () {
  if (network && !alreadyTry) {
    alreadyTry = true;
    debug("Ctrl+c ... removing namespace: " + network.namespace);
    await network.stop();
  }
  process.exit(2);
});

process.on("exit", async function () {
  if (network && !alreadyTry) {
    alreadyTry = true;
    debug("removing namespace: " + network.namespace);
    await network.uploadLogs();
    await network.stop();
  }
  const exitCode = process.exitCode !== undefined ? process.exitCode : 2;
  // use exitCode set by mocha or 2 as default.
  process.exit(exitCode);
});

program
  .addOption(new Option("-m, --monitor", "Start as monitor, do not auto cleanup network"))
  .addOption(new Option("-c, --spawn-concurrency <concurrency>", "Number of concurrent spawning process to launch, default is 1"))
  .command("spawn")
  .description("Spawn the network defined in the config")
  .argument("<networkConfig>", "Network config file path")
  .argument("[creds]", "kubeclt credentials file")
  .action(spawn);

program
  .addOption(
    new Option("-p, --provider <provider>", "Override provider to use")
      .choices(["podman", "kubernetes", "native"])
      .default("kubernetes", "kubernetes")
  )
  .command("test")
  .description("Run tests on the network defined")
  .argument("<testFile>", "Feature file describing the tests")
  .action(test);

program
  .command("version")
  .description("Prints zombienet version")
  .action(() => {
    const p = require("../package.json");
    console.log(p.version);
  });

// spawn
async function spawn(
  configFile: string,
  credsFile: string | undefined,
  _opts: any
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

  // if a provider is passed, let just use it.
  if (opts.provider && AVAILABLE_PROVIDERS.includes(opts.provider)) {
    if (!config.settings) {
      config.settings = {
        provider: opts.provider,
        timeout: DEFAULT_GLOBAL_TIMEOUT,
      };
    } else {
      config.settings.provider = opts.provider;
    }
  }

  let creds = "";
  if (config.settings?.provider === "kubernetes") {
    creds = getCredsFilePath(credsFile || "config") || "";
    if (!creds) {
      console.error("  ⚠ I can't find the Creds file: ", credsFile);
      process.exit();
    }
  }

  const options = { monitor, spawnConcurrency };
  network = await start(creds, config, options);
  network.showNetworkInfo(config.settings?.provider);
}

// test
async function test(testFile: string, _opts: any) {
  const opts = program.opts();
  process.env.DEBUG = "zombie";
  const inCI = process.env.RUN_IN_CONTAINER === "1";
  // use `k8s` as default
  const providerToUse =
    opts.provider && AVAILABLE_PROVIDERS.includes(opts.provider)
      ? opts.provider
      : "kubernetes";
  await run(testFile, providerToUse, inCI, opts.spawnConcurrency);
}

program.parse(process.argv);