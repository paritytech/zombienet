#!/usr/bin/env node

import { start } from "./orchestrator";
import { resolve, dirname } from "path";
import fs from "fs";
import { Network } from "./network";
import { LaunchConfig } from "./types";
import toml from "toml";

if( process.argv.length !== 4) {
	console.error("  ⚠ Missing creds or config file argument...");
	process.exit();
}

const credsFile = process.argv[2];
const configFile = process.argv[3];


for( const file of [credsFile, configFile]) {
  if (!file) {
    console.error("  ⚠ Missing creds/config file argument...");
    process.exit();
  }
}

const configPath = resolve(process.cwd(), configFile);
if (!fs.existsSync(configPath)) {
  console.error("  ⚠ Config file does not exist: ", configPath);
  process.exit();
}

// TODO: add better file recognition
const fileType = configFile.split(".").pop();
let config: LaunchConfig = (fileType?.toLocaleLowerCase() === "json" ) ?
  require(configPath) :
  toml.parse(fs.readFileSync(configPath).toString());

process.on("exit", async function () {
  if (network) await network.stop();
  process.exit(2);
});

// Handle ctrl+c to trigger `exit`.
process.on("SIGINT", async function () {
  if (network) await network.stop();
  process.exit(2);
});

let network: Network;

(async () => {
  network = await start(credsFile, config);
  for( const node of network.nodes) {
    console.log(`Node name: ${node.name}`)
    console.log(`Node direct link: https://polkadot.js.org/apps/?rpc=${encodeURIComponent(node.wsUri)}#/explorer`);
    console.log( "---\n" );
  }
})();
