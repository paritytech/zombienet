[![GitLab Status](https://gitlab.parity.io/parity/zombienet/badges/main/pipeline.svg)](https://gitlab.parity.io/parity/zombienet/pipelines)

# Zombienet

<div align="center">
<p>A cli tool to easily spawn ephemeral Polkadot/Substrate networks and perform tests against them.</p>
</div>

## What is Zombienet?

Zombienet aim to be a testing framework for substrate based blockchains,  providing a simple **cli** tool that allow users to spawn and test ephemeral networks with assertions based in a set of `natural language` expresions. Also, is designed to integrate in a `CI` pipeline easily.

Internally is a `javascript` library, designed to run on NodeJS and support different `providers` to run the *nodes*, at this moment`kubernetes`, `podman` and `native`.

## Usage

Zombienet releases are available in `github`. Each one provide an executable for both `linux` and `macos` crated with [pkg](https://github.com/vercel/pkg) and allow to run `zombienet` cli *without* having `Node.js` installed **but** each `provider` (e.g. k8s, podman) needs to be installed.

### With kubernetes

Zombienet should works with any k8s cluster (e.g [GKE](https://cloud.google.com/kubernetes-engine), [docker-desktop](https://docs.docker.com/desktop/kubernetes/), [kind](https://kind.sigs.k8s.io/)) **but** you need to have `kubectl` installed to interact with your cluster.

Also, you need *access* to create resources (e.g `namespaces`, `pods` and `cronJobs`) in the target cluster.

#### With `Zombienet` GKE cluster.

Zombienet project has it's own k8s cluster in GCP, to use it please ping [Javier](@javier:matrix.parity.io) in element to gain access.

Once you have access, you will also need to install the [Cloud SDK](https://cloud.google.com/sdk/docs/install) and then perform the folowing steps:

- run `gcloud auth login` and follow the auth flow.
- run `gcloud container clusters get-credentials parity-zombienet --zone europe-west3-b --project parity-zombienet` to get the credentials of the cluster, *note* that this will also update your *context* in `kubectl` (you can verify by running `kubectl config current-context`).

Then you are ready to use `zombienet`.

### With Podman

Zombienet support [Podman](https://podman.io/) *rootless* as provider, you only need to have `podman` installed in your environment to use and either set in the *network* file or with the `--provider` flag in the cli.

### With Native

Zombienet support `Native` provider, you only need to have the `binaries` used in your `network` (e.g polkador, adder-collator). To use it either set in the *network* file or with the `--provider` flag in the cli.
**NOTE:** The `native` provider **only** use the `command` config for nodes/collators, both relative and absolute paths are supported. You can use `default_command` config to set the binary to spawn all the `nodes` in the relay chain.

Example:

```toml
[settings]
timeout = 1000

[relaychain]
default_image = "{{ZOMBIENET_INTEGRATION_TEST_IMAGE}}"
chain = "rococo-local"
default_command = "../polkadot/target/release/polkadot"

  [[relaychain.nodes]]
  name = "alice"
  extra_args = [ "--alice" ]

  [[relaychain.nodes]]
  name = "bob"
  extra_args = [ "--bob" ]

[[parachains]]
id = 100
addToGenesis = true

  [parachains.collator]
  name = "collator01"
  image = "{{COL_IMAGE}}"
  command = "../polkadot/target/testnet/adder-collator"
```

### Cli

*For this example we will use the `macos` version of the executable*

```bash
./zombienet-macos
Usage: zombienet [options] [command]

Options:
  -m, --monitor                  Start as monitor, do not auto cleanup network
  -p, --provider <provider>      Override provider to use (choices: "podman", "kubernetes",
                                 "native", default: kubernetes)
  -h, --help                     display help for command

Commands:
  spawn <networkConfig> [creds]  Spawn the network defined in the config
  test <testFile>                Run tests on the network defined
  version                        Prints zombienet version
  help [command]                 display help for command
```

### Configuration files and examples

Zombienet support both `json` and `toml` format to define the Network you want to spawn. You can check the [definition spec](/docs/network-definition-spec.md) to view the available options.

A **minimal** configuration example with two validators and one parachain:

```toml
[relaychain]
default_image = "paritypr/synth-wave:3639-0.9.9-7edc6602-ed5fb773"
chain = "rococo-local"

  [[relaychain.nodes]]
  name = "alice"
  validator = true

  [[relaychain.nodes]]
  name = "bob"
  validator = true

[[parachains]]
id = 100
addToGenesis = false

  [parachains.collator]
  name = "collator01"
  image = "paritypr/colander:4131-ccd09bbf"
  command = "/usr/local/bin/adder-collator"
```

#### Using `env` variables in network config

Zombienet can also make *replacements* in the network config using `env` variables. To define a replacement yo need to use the `{{ENV_VAR_NAME}}` syntax.

For example, from the previous example but using `env` variables could be:

```toml
[relaychain]
default_image = "{{ZOMBIENET_INTEGRATION_TEST_IMAGE}}"
chain = "rococo-local"

  [[relaychain.nodes]]
  name = "alice"
  validator = true

  [[relaychain.nodes]]
  name = "bob"
  validator = true

[[parachains]]
id = 100
addToGenesis = false

  [parachains.collator]
  name = "collator01"
  image = "{{COL_IMAGE}}"
  command = "/usr/local/bin/adder-collator"

```

And `export` the needed values before run:

```bash
export ZOMBIENET_INTEGRATION_TEST_IMAGE=docker.io/paritypr/synth-wave:4131-0.9.12-ccd09bbf-29a1ac18
export COL_IMAGE=docker.io/paritypr/colander:4131-ccd09bbf

./bins/zombienet-macos spawn examples/0001-simple-network.toml
```

You also can use this configuration with your *tests features*, and small example to cover that the network is working (You can check the [test-dsl spec](/docs/test-dsl-definition-spec.md) to view more options):

```feature
Description: Simple Network Smoke Test
Network: ./0001-simple-network.toml
Creds: config


alice: is up
bob: is up
alice: parachain 100 is registered within 225 seconds
alice: parachain 100 block height is at least 10 within 200 seconds
```

Another examples are provided in the [examples](examples) directory.

---

## Development

### Requerimients

- [Node.js](https://nodejs.org/)
- kubernetes cluster to use as target
  - `kubectl` command installed.
- Podman

### Installation

You need first to *clone* this repository and run:

```bash
cd zombienet
npm install
npm run build
```

Then `zombienet` cli is ready to run:

```bash
❯ node dist/cli.js
Usage: zombienet [options] [command]

Options:
  -p, --provider <provider>                Override provider to use (choices: "podman",
                                           "kubernetes", default: kubernetes)
  -h, --help                               display help for command

Commands:
  spawn <networkConfig> [creds] [monitor]  Spawn the network defined in the config
  test <testFile>                          Run tests on the network defined
  version                                  Prints zombienet version
  help [command]                           display help for command
```

## Acknowledgement

This project take inspiration and some patters from [polkadot-launch](https://github.com/paritytech/polkadot-launch) and [simnet](https://gitlab.parity.io/parity/simnet/-/tree/master).