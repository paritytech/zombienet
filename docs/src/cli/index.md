# Cli usage

*For this example we will use the `macos` version of the executable*

```bash
./zombienet-macos
Usage: zombienet [options] [command]

Options:
  -c, --spawn-concurrency <concurrency>  Number of concurrent spawning process to launch, default is 1
  -p, --provider <provider>              Override provider to use (choices: "podman","kubernetes", "native", default: kubernetes)
  -m, --monitor                          Start as monitor, do not auto cleanup network
  -h, --help                             display help for command

Commands:
  spawn <networkConfig> [creds]  Spawn the network defined in the config
  test <testFile>                Run tests on the network defined
  version                        Prints zombienet version
  help [command]                 display help for command
```

