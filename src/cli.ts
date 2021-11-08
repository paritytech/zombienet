#!/usr/bin/env node

import { start } from "./orchestrator";
import { resolve } from "path";
import fs from "fs";
import { Network } from "./network";
import { getCredsFilePath, readNetworkConfig } from "./utils";
import { LaunchConfig } from "./types";
import { run } from "./test-runner";
import { Command } from 'commander';
import { debug } from "console";
const path = require("path");

const program = new Command("zombie-net");

let network: Network;

// Ensure to log the uncaught exceptions
// to debug the problem, also exit because we don't know
// what happens there.
process.on( 'uncaughtException', async err => {
  if (network) {
    debug('removing namespace: ' + network.namespace);
    await network.stop();
  }
  console.log( `uncaughtException` );
  console.log( err);
  debug(err);
  process.exit( 100 );
} );

// Ensure that we know about any exception thrown in a promise that we
// accidentally don't have a 'catch' for.
// http://www.hacksrus.net/blog/2015/08/a-solution-to-swallowed-exceptions-in-es6s-promises/
process.on( 'unhandledRejection', async err => {
  if (network) {
    debug('removing namespace: ' + network.namespace);
    await network.stop();
  }
  debug(err);
  console.log( `unhandledRejection` );
  console.log( err);
  process.exit( 1001 );
} );

// Handle ctrl+c to trigger `exit`.
process.on("SIGINT", async function () {
  if (network) {
    debug('removing namespace: ' + network.namespace);
    await network.stop();
  }
  process.exit(2);
});

process.on("exit", async function () {
  if (network) {
    debug('removing namespace: ' + network.namespace);
    await network.uploadLogs();
    await network.stop();
  }
  const exitCode =  process.exitCode !== undefined ? process.exitCode : 2
  process.exit(exitCode); // use exitCode set by mocha or 2 as default.
});


program
  .command("spawn")
  .description("Spawn the network defined in the config")
  .argument("<creds>", "kubeclt credentials file")
  .argument("<networkConfig>", "network")
  .argument("[monitor]", "Monitor flag, don't teardown the network with the cronjob.")
  .action(spawn);

program
  .command("test")
  .description("Run tests on the network defined")
  .argument("<testFile>", "Feature file describing the tests")
  .action(test);

// spawn
async function spawn(credsFile: string, configFile: string, monitor: string|undefined) {
  const configPath = resolve(process.cwd(), configFile);
  if (!fs.existsSync(configPath)) {
    console.error("  ⚠ Config file does not exist: ", configPath);
    process.exit();
  }

  const filePath = path.resolve(configFile);
  const config = readNetworkConfig(filePath);
  const creds = getCredsFilePath(credsFile);

  if( !creds ) {
    console.error("  ⚠ I can't find the Creds file: ", credsFile);
    process.exit();
  }

  network = await start(creds, config, monitor !== undefined);

  for (const node of network.nodes) {
    console.log("\n");
    console.log(`\t\t Node name: ${node.name}`);
    console.log(
      `Node direct link: https://polkadot.js.org/apps/?rpc=${encodeURIComponent(
        node.wsUri
      )}#/explorer\n`
    );
    console.log(`Node prometheus link: ${node.prometheusUri}\n`);
    console.log("---\n");
  }
}

// test
async function test(testFile: string) {
  process.env.DEBUG = 'zombie';
  const inCI = process.env.RUN_IN_CONTAINER === "1";
  await run(testFile, inCI);
}

program.parse(process.argv);
