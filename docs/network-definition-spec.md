# Network definition spec

**NOTE**: Final config spec is TBD, check [examples](../examples) for use cases.

The network config can be provided both in `json` or `toml` format and each section can contain `provider` specific *keys* that are ignored by others, e.g. when you use the `native` provider all references to `image/s` for nodes are ignored.


## `settings`
- `bootnode`: (Boolean, default true) add bootnode to network.
- `timeout`: (number) global timeout to use for spawning the whole network.
- `provider`: (String, default `kubernetes`) Provider to use (e.g kubernetes, podman).
- `polkadot_introspector`: (Boolean, default false) Deploy an instance of [polkadot-introspector](https://github.com/paritytech/polkadot-introspector), **only** available on `podman` and `kubernetes`.
- `jaeger_agent`: (String) The jaeger agent endpoint passed to the *nodes*, **only** available on `kubernetes`.
- `enable_tracing`: (Boolean, default true) Enable the tracing system, **only** available on  `kubernetes`.

## `relaychain`

- `default_command`: (String, default polkadot) The default command to run.
- `default_image` : (String, default polkadot-debug:master) The default image to use for the nodes of the `relaychain`.
- `chain`: (String, default `rococo-local`) The chain name.
- `chain_spec_path`: (String) Path to the chain spec file, **NOTE** should be the `plain` version to allow customizations.
- `chain_spec_command`: (String) Command to generate the chain spec, **NOTE** can't be used in combination with `chain_spec_path`.
- `default_args`: (Array of strings) An array of arguments to use as default to pass to the `command`.
- `default_overrides`: (Array of objects) An array of overrides to upload to the nodes, objects with:
  - `local_path`: string;
  - `remote_name`: string;
- `default_resources`: (Object) **Only** available in `kubernetes`, represent the resources `limits`/`reservations` needed by the nodes by default.
- `nodes`:
  - `name`: (String) Name of the node.
  - `image`: (String) Override default docker image to use for this node.
  - `command`: (String) Override default command.
  - `commandWithArgs`: (String) Override default command and args.
  - `args`: (Array of strings) Arguments to be passed to the `command`.
  - `validator`: (Boolean, default true) Pass the `--validator` flag to the `command`.
  - `env`: Array of env vars Object to set in the container.
    - name: (String) name of the `env` var.
    - value: (String| number) Value of the env var.
  - `bootnodes`: Array of bootnodes to use.
  - `overrides`: Array of `overrides` definitions.
  - `add_to_bootnodes`: (Boolean, default false) Add this node to the bootnode list.
  - `resources`: (Object) **Only** available in `kubernetes`, represent the resources `limits`/`reservations` needed by the node.
- `node_groups`:

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