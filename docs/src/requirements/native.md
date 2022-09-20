# Native requirements

The Zombienet `Native` provider allows running the nodes as local process in your environments. You only need to have the `binaries` used in your `network` (e.g polkadot, adder-collator).
To use it either configure your *network* file or with the `--provider` flag in the CLI.

**NOTE:** The `native` provider **only** uses the `command` config for nodes/collators, both relative and absolute paths are supported. You can use the `default_command` config to set the binary to spawn all the `nodes` in the relay chain.

*Alternative:* You can set the `command` to the binary directly if is available in your `PATH`.