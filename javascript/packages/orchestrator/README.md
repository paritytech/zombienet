![ci](https://github.com/paritytech/zombienet/actions/workflows/ci.yml/badge.svg)  [![GitLab Status](https://gitlab.parity.io/parity/zombienet/pipelines/pipeline.svg)](https://gitlab.parity.io/parity/zombienet/pipelines)

# Zombienet

<div align="center">
<p>A cli tool to easily spawn ephemeral Polkadot/Substrate networks and perform tests against them.</p>
</div>

## :warning: :construction: Under Active Development :construction: :warning:

This project is still in early stage and very much a work in progress. More features will be added,
docs may be missing or outdated and api/config may change.

NOTE: `polkadot-collator` has recently been renamed `polkadot-parachain`.

---

## What is Zombienet?

Zombienet aims to be a testing framework for Substrate based blockchains, providing a simple **cli**
tool that allows users to spawn and test ephemeral networks. The assertions used in the tests can
include on-chain storage, metrics, logs and custom javascript scripts that interact with the chain.
To make it easy to define those, zombienet has a `natural language` built-in allowing developers to
write tests as smooth as possible.

Internally zombienet is a `javascript` library, designed to run on `Node.js` and support different
backend `providers` to run the *nodes*, at this moment `kubernetes`, `podman` and `native` are
supported.

## Usage

Zombienet releases are available in `github`. Each one provides an executable for both `linux` and
`macos` created with [pkg](https://github.com/vercel/pkg) and allows to run `zombienet` cli
*without* having `Node.js` installed **but** each `provider` defines it's own requirements (e.g.
`k8s`, `podman`).

**Note:** Currently, it is only possible to use `podman` for Zombienet users on Linux machines. 
Although `podman` comes with support for macOS, it is done using an internal VM and the Zombienet provider code expects `podman` to be running natively.

## Status

At the moment Zombienet *only* works with `local` chains (e.g. rococo-local, polkadot-local, etc).

## Requirements by provider

### With kubernetes

Zombienet should work with any `k8s` cluster (e.g [GKE](https://cloud.google.com/kubernetes-engine),
[docker-desktop](https://docs.docker.com/desktop/kubernetes/), [kind](https://kind.sigs.k8s.io/))
**but** you need to have `kubectl` installed to interact with your cluster.

Also, you need *permission* to create resources (e.g `namespaces`, `pods` and `cronJobs`) in the
target cluster.

#### Using `Zombienet` GKE cluster (internally).

Zombienet project has it's own `k8s` cluster in GCP, to use it please ping
<b>Javier</b>(@javier:matrix.parity.io) in element to gain access and steps to use.

### With Podman

Zombienet support [Podman](https://podman.io/) *rootless* as provider, you only need to have
`podman` installed in your environment to use and either set in the *network* file or with the
`--provider` flag in the cli. `Podman` for `zombienet` is currently only supported for Linux machines.
This is mostly related to paths and directories used by 
store configuration (chain-spec) and the data directory.

### With Native

Zombienet `native` provider allows you to run the nodes as a local process in your environment. You
only need to have the `binaries` used in your `network` (e.g `polkadot` or `polkadot-parachain`).
To use it either set in the *network* file or with the `--provider` flag in the cli.

**NOTE:** The `native` provider **only** use the `command` config for nodes/collators, both relative
and absolute paths are supported. You can use `default_command` config to set the binary to spawn
all the `nodes` in the relay chain.

*Alternative:* You can set the `command` to the binary directly if is available in your `PATH`.

## Features by provider

### kubernetes

With `k8s` zombienet use "Prometheus operator" (if it is available) to offload the
`monitoring/visibility` layer, so only the network's pods are deployed by zombienet.

### Podman

With `podman` zombienet deploys a couple of extra pods to add a layer of monitoring/visibility to
the running network. In particular pods for `prometheus`, `tempo` and `grafana` are deployed. Also,
`grafana` is configured to have `prometheus` and `tempo` as datasource.

To access those services you can find the `url` in the output of zombinet:

```bash
  Monitor: prometheus - url: http://127.0.0.1:34123

  Monitor: tempo - url: http://127.0.0.1:34125

  Monitor: grafana - url: http://127.0.0.1:41461
```

*Note*: Grafana is deployed with the default admin access.

Once the network is stopped, by `ctrl+c` on a running spawn or by finishing the test, these pods are
removed with the rest of the pods launched by zombienet.

### Native

Native provider doesn't run any extra layer/process at the moment.

---

### Cli usage

*For this example we will use the `macos` version of the executable*

```bash
❯ ./zombienet-macos
Usage: zombienet-macos [options] [command]

Options:
  -c, --spawn-concurrency <concurrency>  Number of concurrent spawning process to launch, default is 1
  -p, --provider <provider>              Override provider to use (choices: "podman", "kubernetes", "native")
                                         default: kubernetes
  -d, --dir <path>                       Directory path for placing the network files instead of random temp one (e.g. -d /home/user/my-zombienet)
  -l, --logType <logType>                Type of logging on the console - defaults to 'table' (choices: "table", "text", "silent")
  -f, --force                            Force override all prompt commands
  -m, --monitor                          Start as monitor, do not auto cleanup network
  -h, --help                             display help for command

Commands:
  spawn <networkConfig> [creds]  Spawn the network defined in the config
  test <testFile>                Run tests on the network defined
  version                        Prints zombienet version
  help [command]                 display help for command
```

---

### Configuration files and examples

#### Spawning

One of the goals of `zombienet` is to easily spawn ephemeral networks, providing a simple but
powerful *cli* that allows you to declare the desired network in `toml` or `json` format. You can
check the [definition spec](https://paritytech.github.io/zombienet/network-definition-spec.html) to view the available options.

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
  image = "paritypr/colander:master"
  command = "adder-collator"
```

Then you can spawn the network by running the following command:

```bash
❯ ./zombienet-macos spawn --provider native examples/0001-small-network.toml
```

Note that the command expects two binaries `polkadot` and `adder-collator` to be installed on your system. See further down for how to get them.

You can follow the output of the `steps` to spawn the network and once the network is launched a
message with the `node`s information like this one is shown


```bash
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                       Network launched 🚀🚀                                                  │
├─────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Namespace               │ zombie-72a1e2ffad0ad73167061bbd560e0766                                                            │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Provider                │ native                                                                                             │
├─────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                         Node Information                                                     │
├─────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Name                    │ alice                                                                                              │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Direct Link             │ https://polkadot.js.org/apps/?rpc=ws://127.0.0.1:45589#/explorer                                   │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Prometheus Link         │ http://127.0.0.1:44107/metrics                                                                     │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Log Cmd                 │ tail -f  /tmp/zombie-85391d4649f2829bb26b30d6c0328bcb_-15819-BNFoSs5qusWH/alice.log                │ 
├─────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                         Node Information                                                     │
├─────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Name                    │ bob                                                                                                │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Direct Link             │ https://polkadot.js.org/apps/?rpc=ws://127.0.0.1:46459#/explorer                                   │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Prometheus Link         │ http://127.0.0.1:43831/metrics                                                                     │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Log Cmd                 │ tail -f  /tmp/zombie-85391d4649f2829bb26b30d6c0328bcb_-15819-BNFoSs5qusWH/bob.log                  │ 
├─────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                         Node Information                                                     │
├─────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Name                    │ collator01                                                                                         │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Direct Link             │ https://polkadot.js.org/apps/?rpc=ws://127.0.0.1:42607#/explorer                                   │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Prometheus Link         │ http://127.0.0.1:38281/metrics                                                                     │
├─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Log Cmd                 │ tail -f  /tmp/zombie-85391d4649f2829bb26b30d6c0328bcb_-15819-BNFoSs5qusWH/collator01.log           │ 
├─────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Parachain ID            │ 100                                                                                                │
└─────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────┘
│ ChainSpec Path          │ /tmp/zombie-85391d4649f2829bb26b30d6c0328bcb_-15819-BNFoSs5qusWH/rococo-local-100.json             │
└─────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────┘

```

Both the `prometheus` and the `node` links are accessible in your local machine to get the `metrics`
or connect to the node.

#### Using `env` variables in network config

Zombienet can also make *replacements* in the network config using environment variables. To define
a replacement you need to use the `{{ENV_VAR_NAME}}` syntax.

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
add_to_genesis = false

  [parachains.collator]
  name = "collator01"
  image = "{{COL_IMAGE}}"
  command = "adder-collator"
```

Then you can `export` the needed values before you run the command to spawn the network again:

```bash
❯ export ZOMBIENET_INTEGRATION_TEST_IMAGE=docker.io/paritypr/polkadot-debug:master
❯ export COL_IMAGE=docker.io/paritypr/colander:master

❯ ./zombienet-macos spawn examples/0001-small-network.toml
```

##### Teardown

You can teardown the network (and cleanup the used resources) by terminating the process (`ctrl+c`).

---

#### Testing

The other goal of `zombienet` is to provide a way to perform test/assertions against the spawned
network, using a set of `natural language expressions` that allow you to make assertions based on
metrics, logs and some `built-in` function that query the network using `polkadot.js`. Those
assertions should be defined in a *.zndsl test*, and the `dsl` (**D**omain **S**pecific **L**anguage) and format is documented in
[here](https://paritytech.github.io/zombienet/cli/test-dsl-definition-spec.html).

The following is an small example to spawn a network (using the previous `simple network
definition`) and assert that:
- Both `nodes` are running
- The defined `parachain` is registered
- The defined `parachain` is producing blocks and produced at least 10 within 200 seconds.

```feature
Description: Simple Network Smoke Test
Network: ./0001-small-network.toml
Creds: config

alice: is up
bob: is up
alice: parachain 100 is registered within 225 seconds
alice: parachain 100 block height is at least 10 within 200 seconds
```

---

## Development

### Requirements

- [Node.js](https://nodejs.org/) if you are not using the self contained linux or macos
  [releases](https://github.com/paritytech/zombienet/releases).
- [Kubernetes](https://kubernetes.io) cluster to use `kubernetes` target (`kubectl` command installed).
- [Podman](https://podman.io) to use `podman` target.

### Installation

You need first to *clone* this repository and run:

```bash
❯ cd zombienet/javascript
❯ npm i && npm run build
```

### Build `parser-wrapper` locally (optional)

Building the `parser-wrapper` can help on running/testing locally changes on the test parser.
In order to build the parser one first needs to run the `wasm-pack` (make sure that [wasm-pack](https://github.com/rustwasm/wasm-pack) is installed):

```bash
❯ cd zombienet/crates/parser-wrapper
❯ wasm-pack build --release --target nodejs --scope zombienet
```

Once it is done, the next step is to create a symlink to the created `pkg` from inside the javascript directory, as can be seen below:

```bash
❯ cd zombienet/javascript
❯ npm link ../crates/parser-wrapper/pkg/
❯ npm i && npm run build
```

### Download and install needed artifacts (optional)

For an easier and faster setup of your local environment, run:

```bash
❯ cd zombinet/javascript
❯ npm i && npm run zombie -- setup <binaries>
```

This allows to use the `setup` script, making everything ready for a ZombieNet dev environment.

You can use the following arguments:

`--help` shows the different options and commands for using the Zombienet CLI.
`--binaries` or `-b`: enables providing the binaries that you want to be downloaded and installed during the setup. Possible options: `all`, `polkadot`, `polkadot-parachain`. *Note:* Downloading `polkadot` will automatically download also the binaries of `polkadot-prepare-worker`, `polkadot-execute-worker`. Since Polkadot v1.0 all 3 binaries are needed for the node to run as a validator;

For example:

```bash
❯ cd zombinet/javascript
❯ npm i && npm run zombie -- setup polkadot polkadot-parachain
```

> Note: If you are using macOS please clone the [polkadot-sdk repo](https://github.com/paritytech/polkadot-sdk) and run it locally. At the moment there is no `polkadot` binary for MacOs.

The command above will retrieve the binaries provided and try to download and prepare those binaries for usage. 
At the end of the download, the `setup` script will provide a command to run in your local environment in order to add the directory where the binaries were downloaded in your $PATH var, for example:

```bash
Please add the dir to your $PATH by running the command: export PATH=/home/<user>/zombienet/dist:$PATH
```

### Build adder-collator (needed for running examples with native provider)

You can build it from source like this

```bash
❯ git clone git@github.com:paritytech/polkadot-sdk.git
❯ cd polkadot-sdk
❯ cargo build --profile testnet -p test-parachain-adder-collator
❯ export PATH=$(pwd)/target/testnet:$PATH
```


### Using Zombienet

With the above steps completed, the `zombienet` CLI is ready to run:

```bash
❯ cd zombinet/javascript
❯ npm run zombie

Usage: npm run zombie -- [options] [command]

Options:
  -c, --spawn-concurrency <concurrency>    Number of concurrent spawning process to launch, default is 1
  -p, --provider <provider>                Override provider to use (choices: "podman", "kubernetes", "native")
  -l, --logType <logType>                  Type of logging - defaults to 'table' (choices: "table", "text", "silent")
  -d, --dir <path>                         Directory path for placing the network files instead of random temp one 
                                           (e.g. -d /home/user/my-zombienet)
  -f, --force                              Force override all prompt commands
  -h, --help                               display help for command

Commands:
  spawn [options] <networkConfig> [creds]  Spawn the network defined in the config
  test <testFile> [runningNetworkSpec]     Run tests on the network defined
  setup [options] <binaries...>            Setup is meant for downloading and making dev environment of ZombieNet ready
  convert <filePath>                       Convert is meant for transforming a (now deprecated) polkadot-launch configuration to zombienet configuration
  version                                  Prints zombienet version
  help [command]                           display help for command
```

## Acknowledgement

This project take inspiration and some patterns from
[polkadot-launch](https://github.com/paritytech/polkadot-launch) and
[simnet](https://gitlab.parity.io/parity/simnet/-/tree/master).
