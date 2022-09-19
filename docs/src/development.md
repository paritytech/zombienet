# Development

## Requirements

- [Node.js](https://nodejs.org/)
- kubernetes cluster to use as target
  - `kubectl` command installed.
- Podman

## Installation

You need first to _clone_ this repository and run:

```bash
cd zombienet
npm install
npm run build
```

### Download and install needed artifacts (Optional)

For easier and faster setup of local environment, upi can run:

```bash
❯ node dist/cli.js setup <binaries>

Setup is meant for downloading and making everything ready for dev environment of ZombieNet;

You can use the following arguments:

--help shows this message;
--binaries or -b: the binaries that you want to be downloaded and installed during the setup, provided in a row without any separators;
	possible options: 'polkadot', 'polkadot-parachain'
	example: node dist/cli.js setup polkadot polkadot-parachain
```

> Note: If you are using MacOS. Please, clone the polkadot repo (https://github.com/paritytech/polkadot) and run it locally. At the moment there is no `polkadot` binary for MacOs.

Script above will retrieve the binaries provided and try to download and prepare those binaries for usage. At the end of the download, script will provide a command to run in your local environment in order to add the directory where the binaries were downloaded in your $PATH var:

e.g.

```bash
Please add the dir to your $PATH by running the command: export PATH=/home/<user>/current_directory:$PATH
```

### Using Zombienet

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
