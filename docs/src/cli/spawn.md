# Spawning

One of the goal of ZombieNet is easily spawn ephemeral networks, providing a simple but poweful *cli* that allow you to declare the desired network in `toml` or `json` format. You can check the [definition spec](../network-definition-spec.md) to view the available options.

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
./zombienet-macos spawn examples/0001-simple-network.toml
```

You can follow the output of the `steps` to spawn the network and once the network is launched a message with the `node`s information like this one is show

```bash
-----------------------------------------

	 Network launched 🚀🚀

		 In namespace zombie-1b0ad798d89c9f7f9c610bc46849970f with kubernetes provider


		 Node name: bootnode

		 Node direct link: https://polkadot.js.org/apps/?rpc=ws%3A%2F%2F127.0.0.1%3A52562#/explorer

		 Node prometheus link: http://127.0.0.1:52567/metrics

---

		 Node name: alice

		 Node direct link: https://polkadot.js.org/apps/?rpc=ws%3A%2F%2F127.0.0.1%3A52642#/explorer

		 Node prometheus link: http://127.0.0.1:52647/metrics

---

		 Node name: bob

		 Node direct link: https://polkadot.js.org/apps/?rpc=ws%3A%2F%2F127.0.0.1%3A52694#/explorer

		 Node prometheus link: http://127.0.0.1:52699/metrics

---

	 Parachain ID: 100


		 Node name: collator01-1

		 Node direct link: https://polkadot.js.org/apps/?rpc=ws%3A%2F%2F127.0.0.1%3A52742#/explorer
```

Both the `prometheus` and the `node` links are accesibles in your local machine to get the `metrics` or connect to the node.
