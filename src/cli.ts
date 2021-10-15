#!/usr/bin/env node

import { start } from "./orchestrator";
import { resolve } from "path";
import fs from "fs";
import { Network } from "./network";
import { readNetworkConfig } from "./utils";
import { LaunchConfig } from "./types";
import { run } from "./test-runner";

let network: Network;

// Handle ctrl+c to trigger `exit`.
process.on("SIGINT", async function () {
  if (network) await network.stop();
  process.exit(2);
});

process.on("exit", async function () {
  if (network) await network.stop();
  process.exit(2);
});

// // Args parsing
// if (process.argv.length !== 4) {
//   console.error("  ⚠ Missing creds or config file argument...");
//   process.exit();
// }

// const credsFile = process.argv[2];
// const configFile = process.argv[3];

// for (const file of [credsFile, configFile]) {
//   if (!file) {
//     console.error("  ⚠ Missing creds/config file argument...");
//     process.exit();
//   }
// }

// const configPath = resolve(process.cwd(), configFile);
// if (!fs.existsSync(configPath)) {
//   console.error("  ⚠ Config file does not exist: ", configPath);
//   process.exit();
// }

// const config = readNetworkConfig(configFile);

// spawn
async function spawn(credsFile: string, config: LaunchConfig) {
  network = await start(credsFile, config);
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

async function test(testFile: string) {
  await run(testFile);
}

test(process.argv[2]);
// (async () => {
//   network = await start(credsFile, config);
//   for (const node of network.nodes) {
//     console.log("\n");
//     console.log(`\t\t Node name: ${node.name}`);
//     console.log(
//       `Node direct link: https://polkadot.js.org/apps/?rpc=${encodeURIComponent(
//         node.wsUri
//       )}#/explorer\n`);
//     console.log(`Node prometheus link: ${node.prometheusUri}\n`);
//     console.log("---\n");
//   }
// })();
