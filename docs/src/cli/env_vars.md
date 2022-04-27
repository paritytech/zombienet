# Using env vars

ZombieNet can also make *replacements* in the network config using `env` variables. To define a replacement yo need to use the `{{ENV_VAR_NAME}}` syntax.

For example, from the previous example but using `env` variables could be:

```toml
[relaychain]
default_image = "{{ZOMBIENET_INTEGRATION_TEST_IMAGE}}"
chain = "rococo-local"

  [[relaychain.nodes]]
  name = "alice"

  [[relaychain.nodes]]
  name = "bob"

[[parachains]]
id = 100
addToGenesis = false

  [parachains.collator]
  name = "collator01"
  image = "{{COL_IMAGE}}"
  command = "adder-collator"

```

Then you can `export` the needed values before run the command to spawn the network again:

```bash
export ZOMBIENET_INTEGRATION_TEST_IMAGE=docker.io/paritypr/polkadot-debug:master
export COL_IMAGE=docker.io/paritypr/colander:4131-ccd09bbf

./zombienet-macos spawn examples/0001-simple-network.toml
```
