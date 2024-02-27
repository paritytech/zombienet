# Cli usage

_For this example we will use the `macos` version of the executable_

```bash
./zombienet-macos
Usage: zombienet [options] [command]

Options:
  -c, --spawn-concurrency <concurrency>  Number of concurrent spawning process to launch, default is 1
  -p, --provider <provider>              Override provider to use (choices: "podman","kubernetes", "native", default: kubernetes)
  -d, --dir <path>                       Directory path for placing the network files instead of random temp one (e.g. -d /home/user/my-zombienet)
   -l, --logType <logType>"               Type of logging on the console - defaults to 'table'" (choices: "table", "text", "silent")
  -f, --force                            Force override all prompt commands
  -m, --monitor                          Start as monitor, do not auto cleanup network
  -h, --help                             display help for command

Commands:
  spawn <networkConfig> [creds]          Spawn the network defined in the config
  test <testFile> [runningNetworkSpec]   Run tests on the network defined
  setup <binaries...>                    Setup is meant for downloading and making dev environment of ZombieNet ready
  version                                Prints zombienet version
  help [command]                         display help for command

Debug:
  The debug/verbose output is managed by the DEBUG environment variable, you can enable/disable specific debugging namespaces setting an space or comma-delimited names.
  $ e.g $ DEBUG=zombie, zombie::paras zombienet spawn example/0001-example.toml

  The available namespaces are:
  zombie
  zombie::chain
  zombie::cmdGenerator
  zombie::config
  zombie::helper
  zombie::js
  zombie::kube
  zombie::metrics
  zombie::native
  zombie::network
  zombie::paras
  zombie::podman
  zombie::spawner
  zombie::substrateCliArgsVersion
  zombie::test

  NOTE: wildcard (e.g.'zombie*') are supported, for advance use check https://www.npmjs.com/package/debug#wildcards
```
