# Network definition spec

**NOTE**: Final config spec is TBD, check [examples](../examples) for use cases.

## `settings`

<!-- - `init_containers`: An array of initialization containers to run before bootstrap the Network.
  - `image`: Docker image to use.
  - `command`: Command to excecute. -->
<!-- - `global_volumes`: An array of volumes to create
  - `name`: Name of the volume.
  - `fs_type`: Type of fs to use.
  - `mount_path`: Destination path to mount. -->
- `bootnode`: (Boolean, default true) add bootnode to network.
- `bootnode_domain`: optional bootnode domain name.
- `timeout`: (number) global timeout to use for spawning the network.
- `provider`: Provider to use (e.g kubernetes, podman).

## `relaychain`

- `default_command` : The default command to run. (`polkadot` by default).
- `default_image` : The default image to use for the nodes of the `relaychain`. (*TBD*: define a default value)
- `chain`: The chain you want to use to generate your spec (probably `rococo-local`).
- `chain_spec_path` : Path to the chain spec file, **NOTE** should be the `plain` version to allow customizations.
- `chain_spec_command` : Command to generate the chain spec, **NOTE** can't be used in combination with `chain_spec_path`.
- `default_args` : An array of arguments to use as default to pass to the `command`.
- `default_overrides`: An array of overrides to upload to the nodes, objects with:
  - `local_path`: string;
  - `remote_name`: string;
- `nodes` :
  - `name` : Name to use.
  - `image` : Override default docker image to use for this node.
  - `command`: Override default command.
  - `commandWithArgs`: Override default command and args.
  - `wsPort`: The WS port for this node. (`9944` by default).
  - `port`: The TCP port for this node. (`30444` by default).
  - `args`: Arguments to be passed to the `command`.
  - `extra_args`: Array of strings to pass as arguments to the command.
  - `validator`: Pass the `--validator` flag to the `command`.
  - `env`: Array of env vars Object to set in the container.
    - Env var objects must have `name` and `value` key.
  - `bootnodes`: Array of bootnodes to use.
  - `initContainers`: Array of `initContainer` definition to run.
  - `overrides`: Array of `overrides` definitions.

## `parachains`

- `parachains` Array of `parachain` definition objects
  - `id`: The id to assign to this parachain. Must be unique.
  - `addToGenesis`: Boolean, flag to add parachain to genesis or register in runtime.
  - `balance`: (*TODO*) Configure a starting amount of balance on the relay chain for this chain's account ID
  - `genesis_wasm_path`: Path to the wasm file to use.
  - `genesis_wasm_generator`: Command to generate the wasm file.
  - `genesis_state_path`: Path to the state file to use.
  - `genesis_state_generator`: Command to generate the state file.
  - `collator`:
    - `name`: Name to use.
    - `image`: Image to use.
    - `command`: Command to run. (`polkadot-collator` by default).
    - `args`: An array of arguments to use as default to pass to the `command`.
    - `commandWithArgs`: Overrides `command` and `args`.

## `types`

- Object to use as `user defined types` with the js api.