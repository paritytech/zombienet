# Cli usage

_For this example we will use the `macos` version of the executable_

```bash
./zombienet-macos
Usage: zombienet [options] [command]

Options:
  -c, --spawn-concurrency <concurrency>  Number of concurrent spawning process to launch, default is 1
  -p, --provider <provider>              Override provider to use (choices: "podman","kubernetes", "native", default: kubernetes)
  -m, --monitor                          Start as monitor, do not auto cleanup network
  -h, --help                             display help for command

Commands:
  spawn <networkConfig> [creds]          Spawn the network defined in the config
  test <testFile> [runningNetworkSpec]   Run tests on the network defined
  setup <binaries...>                    Setup is meant for downloading and making dev environment of ZombieNet ready
  version                                Prints zombienet version
  help [command]                         display help for command

```
