# Network definition spec

**NOTE**: Final config spec is TBD, check [examples](https://github.com/paritytech/zombienet/blob/main/examples) for use cases.

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
- `local_ip`: (String, default "127.0.0.1") ip used for expose local services (rpc/metrics/monitors).

## `relaychain`

- `default_command`: (String, default polkadot) The default command to run.
- `default_image` : (String, default polkadot-debug:master) The default image to use for the nodes of the `relaychain`.
- `chain`: (String, default `rococo-local`) The chain name.
- `chain_spec_path`: (String) Path to the chain spec file, **NOTE** should be the `plain` version to allow customizations.
- `chain_spec_command`: (String) Command to generate the chain spec, **NOTE** can't be used in combination with `chain_spec_path`.
- `default_args`: (Array of strings) An array of arguments to use as default to pass to the `command`.
- `default_substrate_cli_args_version`: (0|1|2) Allow to set the substrate cli args version (see: https://github.com/paritytech/substrate/pull/13384). By default zombienet will evaluate your binary and set the correct version, but that produces a small overhead that could be skipped if you set directly with this key.
- `default_overrides`: (Array of objects) An array of overrides to upload to the nodes, objects with:
  - `local_path`: string;
  - `remote_name`: string;
- `default_resources`: (Object) **Only** available in `kubernetes`, represent the resources `limits`/`reservations` needed by the nodes by default.
- `default_prometheus_prefix`: A parameter for customizing the metric's prefix. If parameter is placed in `relaychain` level, it will be "passed" to all `relaychain` nodes. Defaults to 'substrate'.
- `random_nominators_count`: (number, optional), if is set _and the stacking pallet is enabled_ zombienet will generate `x` nominators and will be injected in the genesis.
- `max_nominations`: (number, default 24), the max allowed number of nominations by a nominator. This should match the value set in the runtime (e.g Kusama is 24 and Polkadot 16).
- `nodes`:
  - `*name`: (String) Name of the node.
  - `image`: (String) Override default docker image to use for this node.
  - `command`: (String) Override default command.
  - `command_with_args`: (String) Override default command and args.
  - `args`: (Array of strings) Arguments to be passed to the `command`.
  - `substrate_cli_args_version`: (0|1|2) By default zombienet will evaluate your binary and set the correct version, but that produces a small overhead that could be skipped if you set directly with this key.
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
  - `prometheus_prefix`: A parameter for customizing the metric's prefix for the specific node. Will apply only to this node; Defaults to 'substrate'.
  - `keystore_key_types`: Defines which keystore keys should be created, for more details checkout details below.
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
  - `prometheus_prefix`: A parameter for customizing the metric's prefix for the specific node. Will apply to all the nodes of the group; Defaults to 'substrate'.
  - `resources`: (Object) **Only** available in `kubernetes`, represent the resources `limits`/`reservations` needed by the node.
  - `substrate_cli_args_version`: (0|1|2) By default zombienet will evaluate your binary and set the correct version, but that produces a small overhead that could be skipped if you set directly with this key.

## `parachains`

- `parachains` Array of `parachain` definition objects

  - `*id`: (Number) The id to assign to this parachain. Must be unique.
  - `add_to_genesis`: (Boolean, default true) flag to add parachain to genesis or register in runtime.
  - `cumulus_based`: (Boolean, default true) flag to use `cumulus` command generation.
  - `genesis_wasm_path`: (String) Path to the wasm file to use.
  - `genesis_wasm_generator`: (String) Command to generate the wasm file.
  - `genesis_state_path`: (String) Path to the state file to use.
  - `genesis_state_generator`: (String) Command to generate the state file.
  - `prometheus_prefix`: A parameter for customizing the metric's prefix for the specific node. Will apply only to all parachain nodes/collators; Defaults to 'substrate'.
  - `default_substrate_cli_args_version`: (0|1|2) Allow to set the substrate cli args version (see: https://github.com/paritytech/substrate/pull/13384). By default zombienet will evaluate your binary and set the correct version, but that produces a small overhead that could be skipped if you set directly with this key.
  - `collator`:

    - `*name`: (String) Name of the collator.
    - `image`: (String) Image to use.
    - `command`: (String, default `polkadot-parachain`) Command to run.
    - `args`: (Array of strings) An array of arguments to use as default to pass to the `command`.
    - `packages/orchestrator/src/providers/k8s/index.ts`: (0|1) By default zombienet will evaluate your binary and set the correct version, but that produces a small overhead that could be skipped if you set directly with this key.
    - `command_with_args`: (String) Overrides `command` and `args`.
    - `env`: Array of env vars Object to set in the container.
      - name: (String) name of the `env` var.
      - value: (String| number) Value of the env var.
    - `keystore_key_types`: Defines which keystore keys should be created, for more details checkout details below.
    - `substrate_cli_args_version`: (0|1|2) By default zombienet will evaluate your binary and set the correct version, but that produces a small overhead that could be skipped if you set directly with this key.

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
      - `substrate_cli_args_version`: (0|1|2) By default zombienet will evaluate your binary and set the correct version, but that produces a small overhead that could be skipped if you set directly with this key.

  - `onboard_as_parachain`: (Boolean, default true) flag to specify whether the para should be onboarded as a parachain or stay a parathread
  - `register_para`: (Boolean, default true) flag to specify whether the para should be registered. The `add_to_genesis` flag **must** be set to false for this flag to have any effect.

## `hrmp_channels`: (Array of objects)

- `sender`: (Number) parachain Id.
- `recipient`: (Number) parachain Id.
- `max_capacity`: (Number)
- `max_message_size`: (Number)

## `types`

- Object to use as `user defined types` with the js api.

## `keystore_key_types`

- There are 2 ways to specify key, values that don't respect below format will be ignored:
  - short: `audi` - creates `audi` key type that defaults to predefined schema, it predefined schema for given key type doesn't exist it is ignored
  - long: `audi_sr` - creates `audi` key type with `sr` schema

- Schemas: `ed`, `ec`, `sr`

- Predefined key type schemas:
  - `aura` - `sr` if statemint or asset hub polkadot parachain, otherwise `ed`
  - `babe` - `sr`
  - `imon` - `sr`
  - `gran` - `ed`
  - `audi` - `sr`
  - `asgn` - `sr`
  - `para` - `sr`
  - `beef` - `ec`
  - `nmbs` - `sr`
  - `rand` - `sr`
  - `rate` - `ed`
  - `acco` - `sr`
