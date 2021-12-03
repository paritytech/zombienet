[![GitLab Status](https://gitlab.parity.io/parity/zombienet/badges/main/pipeline.svg)](https://gitlab.parity.io/parity/zombienet/pipelines)

# Zombienet

Zombienet project allows to easily spawn networks and perform tests against them, providing two entry points to perform the `spawning` and `testing` phase.

Internally is a `javascript` library, designed to run on NodeJS and using a kubernetes cluster as target infrastracture.

## Requerimients

- [NodeJs](https://nodejs.org/)
- kubernetes cluster to use as target
  - `kubectl` command installed.

## Installation

For use `zombienet` you need first to *clone* this repository and run:

```bash
cd zombienet
npm install
npm run build
```

Then `zombienet` cli is ready to run:

```bash
❯ node dist/cli.js
Usage: zombie-net [options] [command]

Options:
  -h, --help                               display help for command

Commands:
  spawn <creds> <networkConfig> [monitor]  Spawn a new network.
  test <testFile>                          Spawn a new network and run the defined test.
  help [command]                           display help for command
```

### Zombienet k8s cluster access

Zombienet project has it's own k8s cluster in GCP, to use it please ping [Javier](@javier:matrix.parity.io) in element to gain access.

## Configuration files and usage

Zombiente support both `json` and `toml` format to define the Network you want to spawn. Yo can check the [definition spec](/docs/network-definition-spec.md) to view the available options.

A **minimal** configuration example:

```toml
[relaychain]
default_image = "paritypr/synth-wave:3639-0.9.9-7edc6602-ed5fb773"
chain = "rococo-local"

  [[relaychain.nodes]]
  name = "alice"
  validator = true
  extra_args = [ "--alice", "-lparachain=debug" ]

  [[relaychain.nodes]]
  name = "bob"
  validator = true
  extra_args = [ "--bob", "-lparachain=debug" ]

[[parachains]]
id = 100

  [parachains.collator]
  name = "collator01"
  image = "paritypr/colander:4131-ccd09bbf"
  command = "/usr/local/bin/adder-collator"
  args = ["-lparachain=debug"]
```

### Using `env` variables in network config

Zombienet can make *replacements* in the network config using `env` variables. To define a replacement yo need to use the `{{ENV_VAR_NAME}}` syntax.

For example, from the previous example but using `env` variables could be:

```toml
[relaychain]
default_image = "{{ZOMBIENET_INTEGRATION_TEST_IMAGE}}"
chain = "rococo-local"

  [[relaychain.nodes]]
  name = "alice"
  validator = true
  extra_args = [ "--alice", "-lparachain=debug" ]

  [[relaychain.nodes]]
  name = "bob"
  validator = true
  extra_args = [ "--bob", "-lparachain=debug" ]

[[parachains]]
id = 100

  [parachains.collator]
  name = "collator01"
  image = {{COL_IMAGE}}
  command = "/usr/local/bin/adder-collator"
  args = ["-lparachain=debug"]

```

And `export` the needed values before run:

```bash
export ZOMBIENET_INTEGRATION_TEST_IMAGE=docker.io/paritypr/synth-wave:4131-0.9.12-ccd09bbf-29a1ac18
export COL_IMAGE=docker.io/paritypr/colander:4131-ccd09bbf
```

Another examples are provided in the [examples](examples) directory.

## Acknowledgement

This project take inspiration and some patters from [polkadot-launch](https://github.com/paritytech/polkadot-launch) and [simnet](https://gitlab.parity.io/parity/simnet/-/tree/master).