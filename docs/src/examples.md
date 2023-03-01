# Examples

## Intro

In this section we will describe the `.zndsl` and config (`.toml` or `yaml` or `json`) files that exist under `examples` directory in the root of ZombieNet project;

The examples are split in X different ones that each one describes a separate case;

## 0000-test-configs-small-network

In this example, is shown the alternateive options of a configuration file. The different extensions supported are:  `yaml`, `json` and of course `.toml`. 
This simple config exists only in order to show how the same configuration exists in 3 different formats, and thus uses only 1 relay chain (`rococo-local`) with 2 nodes (`alice` and `bob`);

The configuration files are:
- 0000-test-config-small-network.json;
- 0000-test-config-small-network.yaml;
- 0000-test-config-small-network.toml;

and the test files for running each confgiration are:
- 0000-test-json-config-small-network.zndsl;
- 0000-test-yaml-config-small-network.zndsl;
- 0000-test-toml-config-small-network.zndsl;
accordingly.

Each `.zndsl` file contains at the `header` part of the file the:
```toml
Network: ./0000-test-config-small-network.json
```
that describes which config file will be used for the test.

To run the three tests (assuming the native provider is used) just execute the following commands for each test:

```bash
./zombienet -p native test ./examples/0000-test-json-config-small-network.zndsl
```

```bash
./zombienet -p native test ./examples/0000-test-yaml-config-small-network.zndsl
```

```bash
./zombienet -p native test ./examples/0000-test-toml-config-small-network.zndsl
```

> Note: remember to use `-p podman` for Podman as provider, while no `-p` option as default is the `kubernetes` one.

