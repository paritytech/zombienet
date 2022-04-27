# Native requirements

ZombieNet `Native` provider allow to run the nodes as local process in your environments. You only need to have the `binaries` used in your `network` (e.g polkador, adder-collator).
To use it either set in the *network* file or with the `--provider` flag in the cli.

**NOTE:** The `native` provider **only** use the `command` config for nodes/collators, both relative and absolute paths are supported. You can use `default_command` config to set the binary to spawn all the `nodes` in the relay chain.

*Alternative:* You can set the `command` to the binary directly if is available in your `PATH`.

