# Spawning

One of the goal of ZombieNet is easily spawn ephemeral networks, providing a simple but poweful _cli_ that allow you to declare the desired network in `toml` or `json` format. You can check the [definition spec](../network-definition-spec.md) to view the available options.

A **minimal** configuration example with two validators and one parachain:

```toml
[settings]
timeout = 1000

[relaychain]
default_image = "paritypr/polkadot-debug:master"
chain = "rococo-local"

  [[relaychain.nodes]]
  name = "alice"

  [[relaychain.nodes]]
  name = "bob"

[[parachains]]
id = 100

  [parachains.collator]
  name = "collator01"
  image = "paritypr/colander:4131-ccd09bbf"
  command = "adder-collator"
```

Then you can spwan the network by running the following command:

```bash
./zombienet-macos spawn examples/0001-small-network.toml
```

You can follow the output of the `steps` to spawn the network and once the network is launched a message with the `node`s information like this one is show

```bash
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                       Network launched 🚀🚀                                                            |
├─────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────┤
│ Namespace                    | zombie-0c26e3512b222b8cd7053d4f632f0b62                                                                 |
├─────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────┤
│ Provider                     | native                                                                                                  |
├─────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                         Node Information                                                               |
├─────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────┤
│ Name                         | alice                                                                                                   |
├─────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────┤
│ Direct Link                  | https://polkadot.js.org/apps/?rpc=ws://127.0.0.1:43185#/explorer                                        |
├─────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────┤
│ Prometheus Link              | http://127.0.0.1:44521/metrics                                                                          |
├─────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                         Node Information                                                               |
├─────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────┤
│ Name                         | bob                                                                                                     |
├─────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
│ Direct Link                  | https://polkadot.js.org/apps/?rpc=ws://127.0.0.1:45645#/explorer                                        |
├─────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
│ Prometheus Link              | http://127.0.0.1:38901/metrics                                                                          |
├─────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                         Node Information                                                               |
├─────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────┤
│ Name                         | collator01                                                                                              |
├─────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
│ Direct Link                  | https://polkadot.js.org/apps/?rpc=ws://127.0.0.1:37543#/explorer                                        |
├─────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
│ Prometheus Link              | http://127.0.0.1:44807/metrics                                                                          |
├─────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
│ Parachain ID                 | 100                                                                                                     |
├─────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
│ ChainSpec Path               | /tmp/zombie-0c26e3512b222b8cd7053d4f632f0b62_-20554-cMuCmVc8OQ7f/rococo-local-100.json                  │
└─────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────┘

```

Both the `prometheus` and the `node` links are accesibles in your local machine to get the `metrics` or connect to the node.
