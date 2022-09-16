# Network definition spec

**NOTE**: Final config spec is TBD, check [examples](../examples) for use cases.

The network config can be provided both in `json` or `toml` format and each section can contain `provider` specific _keys_ that are ignored by others, e.g. when you use the `native` provider all references to `image/s` for nodes are ignored.

## `settings`

- `bootnode`: (Boolean, default true) add bootnode to network.
- `timeout`: (number) global timeout to use for spawning the whole network.
- `provider`: (String, default `kubernetes`) Provider to use (e.g kubernetes, podman).
- `backchannel`: (Boolean, default false) Deploy an instance of backchannel server. **Only** available on `kubernetes`.
- `polkadot_introspector`: (Boolean, default false) Deploy an instance of [polkadot-introspector](https://github.com/paritytech/polkadot-introspector), **only** available on `podman` and `kubernetes`.
- `jaeger_agent`: (String) The jaeger agent endpoint passed to the _nodes_, **only** available on `kubernetes`.
- `enable_tracing`: (Boolean, default true) Enable the tracing system, **only** available on `kubernetes`.
- `tracing_collator_url`: (String) The url of the tracing collator used to query by the _tracing assertion_ (**Should be tempo query compatible**).
- `tracing_collator_service_name`: (String, default `tempo-tempo-distributed-query-frontend`) service name for tempo query frontend, **only** available on `kubernetes`.
- `tracing_collator_service_namespace`: (String, default `tempo`) namespace where tempo is running, **only** available on `kubernetes`.
- `tracing_collator_service_port`: (Number, default `3100`) port of the query instance of tempo, **only** available on `kubernetes`.
- `node_spawn_timeout`: (Number, default per provider) timeout to spawn pod/process.

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
  - `*name`: (String) Name of the node.
  - `image`: (String) Override default docker image to use for this node.
  - `command`: (String) Override default command.
  - `command_with_args`: (String) Override default command and args.
  - `args`: (Array of strings) Arguments to be passed to the `command`.
  - `validator`: (Boolean, default true) Pass the `--validator` flag to the `command`.
  - `invulnerable`: (Boolean, default false) If true, the node will be added to `invulnerables` in the chain spec.
  - `balance`: (number, default 2000000000000) Balance to set in `balances` for node's account.
  - `env`: Array of env vars Object to set in the container.
    - name: (String) name of the `env` var.
    - value: (String| number) Value of the env var.
  - `bootnodes`: Array of bootnodes to use.
  - `overrides`: Array of `overrides` definitions.
  - `add_to_bootnodes`: (Boolean, default false) Add this node to the bootnode list.
  - `resources`: (Object) **Only** available in `kubernetes`, represent the resources `limits`/`reservations` needed by the node.
  - `ws_port`: (number), WS port to use.;
  - `rpc_port`: (number) RPC port to use;
  - `prometheus_port`: (number) Prometheus port to use;
- `node_groups`:
  - `*name`: (String) Group name, used for naming the nodes (e.g name-1)
  - `*count` (Number), Number of `nodes` to launch for this group.
  - `image`: (String) Override default docker image to use for this node.
  - `command`: (String) Override default command.
  - `args`: (Array of strings) Arguments to be passed to the `command`.
  - `env`: Array of env vars Object to set in the container.
    - name: (String) name of the `env` var.
    - value: (String| number) Value of the env var.
  - `overrides`: Array of `overrides` definitions.
  - `resources`: (Object) **Only** available in `kubernetes`, represent the resources `limits`/`reservations` needed by the node.

## `parachains`

- `parachains` Array of `parachain` definition objects

  - `*id`: (Number) The id to assign to this parachain. Must be unique.
  - `add_to_genesis`: (Boolean) flag to add parachain to genesis or register in runtime.
  - `cumulus_based`: (Boolean) flag to use `cumulus` command generation.
  - `genesis_wasm_path`: (String) Path to the wasm file to use.
  - `genesis_wasm_generator`: (String) Command to generate the wasm file.
  - `genesis_state_path`: (String) Path to the state file to use.
  - `genesis_state_generator`: (String) Command to generate the state file.
  - `collator`:

    - `*name`: (String) Name of the collator.
    - `image`: (String) Image to use.
    - `command`: (String, default `polkadot-parachain`) Command to run.
    - `args`: (Array of strings) An array of arguments to use as default to pass to the `command`.
    - `command_with_args`: (String) Overrides `command` and `args`.
    - `env`: Array of env vars Object to set in the container.
      - name: (String) name of the `env` var.
      - value: (String| number) Value of the env var.

  - `collator_groups`:
    - `*name`: (String) Name of the collator.
    - `*count`: (Number) Number of `collators` to launch for this group.
    - `image`: (String) Image to use.
    - `command`: (String, default `polkadot-parachain`) Command to run.
    - `args`: (Array of strings) An array of arguments to use as default to pass to the `command`.
    - `command_with_args`: (String) Overrides `command` and `args`.
    - `env`: Array of env vars Object to set in the container.
      - name: (String) name of the `env` var.
      - value: (String| number) Value of the env var.

## `hrmpChannels`: (Array of objects)

- `sender`: (Number) parachain Id.
- `recipient`: (Number) parachain Id.
- `max_capacity`: (Number)
- `max_message_size`: (Number)

## `types`

- Object to use as `user defined types` with the js api.
