# Development

## Requerimients

- [Node.js](https://nodejs.org/)
- kubernetes cluster to use as target
  - `kubectl` command installed.
- Podman

## Installation

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
