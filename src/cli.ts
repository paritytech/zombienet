#!/usr/bin/env node
import { start } from "./orchestrator";
import { resolve, dirname } from "path";
import fs from "fs";
import { argv } from "yargs";
import { Network, NetworkNode } from "./network";

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

const c = {
  relaychain : {
    default_image: "paritypr/synth-wave:3639-0.9.9-7edc6602-ed5fb773",
    chain: "rococo-local",
    nodes : [
      {
        name: 'alice',
        validator: true,
        extra_args: ['--alice', '-lparachain=debug']
      },
      {
        name: 'bob',
        validator: true,
        extra_args: ['--bob', '-lparachain=debug']
      }
    ]
  },
  parachains : [
    {
      id: 100,
      collator: {
        name: "collator01",
        commandWithArgs: "/usr/local/bin/adder-collator -lparachain=debug --chain /cfg/rococo-local.json --port 30333 --no-mdns --bootnodes /dns/bootnode/tcp/30333/p2p/12D3KooWEyoppNCUx8Yx66oV9fJnriXwCcXwDDUA2kj6vnc6iDEp"
      }
    }
  ]
};

(async () => {
  network = await start("/Users/pepo/.kube/config",c);
  for( const node of network.nodes) {
    console.log(`Node name: ${node.name}`)
    console.log(`Node direct link: https://polkadot.js.org/apps/?rpc=${encodeURIComponent(node.wsUri)}#/explorer`);
    console.log( '---\n' );
  }
})();
