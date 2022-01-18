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

## Requeriments by provider

### With kubernetes

Zombienet should works with any k8s cluster (e.g [GKE](https://cloud.google.com/kubernetes-engine), [docker-desktop](https://docs.docker.com/desktop/kubernetes/), [kind](https://kind.sigs.k8s.io/)) **but** you need to have `kubectl` installed to interact with your cluster.

Also, you need *access* to create resources (e.g `namespaces`, `pods` and `cronJobs`) in the target cluster.

#### Using `Zombienet` GKE cluster (internally).

Zombienet project has it's own k8s cluster in GCP, to use it please ping [Javier](@javier:matrix.parity.io) in element to gain access and steps to use.

### With Podman

Zombienet support [Podman](https://podman.io/) *rootless* as provider, you only need to have `podman` installed in your environment to use and either set in the *network* file or with the `--provider` flag in the cli.

### With Native

Zombienet `Native` provider allow to run the nodes as local process in your environments. You only need to have the `binaries` used in your `network` (e.g polkador, adder-collator).
To use it either set in the *network* file or with the `--provider` flag in the cli.

**NOTE:** The `native` provider **only** use the `command` config for nodes/collators, both relative and absolute paths are supported. You can use `default_command` config to set the binary to spawn all the `nodes` in the relay chain.

*Alternative:* You can set the `command` to the binary directly if is available in your `PATH`.

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

---

### Cli usage

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

---

### Configuration files and examples

#### Spawning

One of the goal of `zombienet` is easily spawn ephemeral networks, providing a simple but poweful *cli* that allow you to declare the desired network in `toml` or `json` format. You can check the [definition spec](/docs/network-definition-spec.md) to view the available options.

A **minimal** configuration example with two validators and one parachain:

```toml
[settings]
timeout = 1000

[relaychain]
default_image = "paritypr/synth-wave:3639-0.9.9-7edc6602-ed5fb773"
chain = "rococo-local"

  [[relaychain.nodes]]
  name = "alice"
  extra_args = [ "--alice" ]

  [[relaychain.nodes]]
  name = "bob"
  extra_args = [ "--bob" ]

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

Both the `prometheus` and the ` node` links are accesibles in your local machine to get the `metrics` or connect to the node.

#### Using `env` variables in network config

Zombienet can also make *replacements* in the network config using `env` variables. To define a replacement yo need to use the `{{ENV_VAR_NAME}}` syntax.

For example, from the previous example but using `env` variables could be:

```toml
[relaychain]
default_image = "{{ZOMBIENET_INTEGRATION_TEST_IMAGE}}"
chain = "rococo-local"

  [[relaychain.nodes]]
  name = "alice"
  extra_args = [ "--alice" ]

  [[relaychain.nodes]]
  name = "bob"
  extra_args = [ "--bob" ]

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
export ZOMBIENET_INTEGRATION_TEST_IMAGE=docker.io/paritypr/synth-wave:4131-0.9.12-ccd09bbf-29a1ac18
export COL_IMAGE=docker.io/paritypr/colander:4131-ccd09bbf

./zombienet-macos spawn examples/0001-simple-network.toml
```

##### Teardown

You can teardown the network (and cleanup the used resources) by terminating the process (`Ctrl+c`).

---

#### Testing

The other goal of `zombienet` is provide a way to perform test/assertions agins the spawned network, using a set of `natural language expressions` that allow to make assertions based on metrics, logs and some `built-in` function that query the network usin `polkadot.js`.
Those assertions should be defined in a *feature test*, and the `dsl` and format is documented in [here](/docs/test-dsl-definition-spec.md).

The following is an small example to spawn a network (using the previos `simple network definition`) and assert that:
  - Both `nodes` are running
  - The definded `parachain` is registered
   - The defined `parachain` is producing blocks and produced at least 10 within 200 seconds.

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