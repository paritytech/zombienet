# Development

## Requirements

- [Node.js](https://nodejs.org/)
- kubernetes cluster to use as target
  - `kubectl` command installed.
- Podman

## Installation

You need to first _clone_ this repository and run:

```bash
❯ cd zombienet/javascript
❯ npm install
❯ npm run build
```

### Download and install needed artifacts (optional)

For an easier and faster setup of your local environment, run:

```bash
❯ cd zombinet/javascript
❯ npm run zombie -- setup <binaries>
```

This allows to use the `setup` script, making everything ready for a ZombieNet dev environment.

You can use the following arguments:

`--help` shows the different options and commands for using the Zombienet CLI.
`--binaries` or `-b`: enables providing the binaries that you want to be downloaded and installed during the setup. Possible options: `polkadot`, `polkadot-parachain`.

For example:

```bash
❯ cd zombinet/javascript
❯ npm run zombie -- setup polkadot polkadot-parachain
```

> Note: If you are using macOS please clone the [polkadot-sdk repo](https://github.com/paritytech/polkadot-sdk) and run it locally. At the moment there is no `polkadot` binary for MacOs.

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
❯ cd zombinet/javascript
❯ npm run zombie

Usage: zombienet [options] [command]

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
