# Development

## Requirements

- [Node.js](https://nodejs.org/)
- kubernetes cluster to use as target
  - `kubectl` command installed.
- Podman

## Installation

You need to first _clone_ this repository and run:

```bash
cd zombienet/javascript
npm install
npm run build
```

### Download and install needed artifacts (optional)

For an easier and faster setup of your local environment, run:

```bash
node dist/cli.js setup <binaries>
```

This allows to use the `setup` script, making everything ready for a ZombieNet dev environment.

You can use the following arguments:

`--help` shows the different options and commands for using the Zombienet CLI.
`--binaries` or `-b`: enables providing the binaries that you want to be downloaded and installed during the setup. Possible options: `polkadot`, `polkadot-parachain`.

For example:

```bash
node dist/cli.js setup polkadot polkadot-parachain
```

> Note: If you are using macOS please clone the [Polkadot-SDK repo](https://github.com/paritytech/polkadot-sdk) and run it locally. At the moment there is no `polkadot` binary for MacOs.

The command above will retrieve the binaries provided and try to download and prepare those binaries for usage.
At the end of the download, the `setup` script will provide a command to run in your local environment in order to add the directory where the binaries were downloaded in your $PATH var, for example:

```bash
Please add the dir to your $PATH by running the command: export PATH=/home/<user>/<current_directory>/dist:$PATH
```

### Nix Flake

Each time the `javascript/package-lock.json` is updated, the value of `npmDepsHash` must be updated in `flake-module.nix`.

The value it needs to be updated to can be found by running:

```
nix run nixpkgs#prefetch-npm-deps -- javascript/package-lock.json 2>/dev/null
```

### Using Zombienet

With the above steps completed, the `zombienet` CLI is ready to run:

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
  setup                                    Runs the setup of local environment
  help [command]                           display help for command
```
