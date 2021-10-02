# zombie-net

## Configuration Files

We support both `json` and `toml` format to define the Network you want to spawn and test (optional).

You can see an example of each one in the [examples](examples) directory.

### `settings`

- `init_containers` : An array of initialization containers to run before bootstrap the Network.
  - `image`: Docker image to use.
  - `command`: Command to excecute.
- `global_volumes`: An array of volumes to create
  - `name`: Name of the volume.
  - `fs_type`: Type of fs to use.
  - `mount_path`: Destination path to mount.

#### `relaychain`

- `default_command` : The default command to run. (`polkadot` by default).
- `default_image` : The default image to use for the nodes of the `relaychain`. (TODO: define a default value)
- `chain`: The chain you want to use to generate your spec (probably `rococo-local`).
- `chain_spec_path` : Path to the chain spec file.
- `chain_spec_command` : Command to generate the chain spec, **NOTE** can't be used in combination with `chain_spec_path`.
- `default_args` : An array of arguments to use as default to pass to the `command`.
- `nodes` :
  - `name` : Name to use.
  - `wsPort` : The WS port for this node. (`9944` by default).
  - `port` : The TCP port for this node. (`30444` by default).
  - `image` : Override default docker image to use for this node.
  - `command`: Override default command.
  - `args` : Overrides the array of arguments to pass to the command.
  - `extra_args` : An array of arguments to `merge` into the final arguments to use.

#### `parachains`

`parachains` is an array of objects that consists of:

- `id` : The id to assign to this parachain. Must be unique.
- `balance` : (Optional) Configure a starting amount of balance on the relay chain for this chain's account ID
- `genesis_wasm_path` : Path to the wasm file to use.
- `genesis_wasm_generator` : Command to generate the wasm file.
- `genesis_state_path` : Path to the state file to use.
- `genesis_state_generator` : Commandto generate the state file.
- `collator` :
  - `name` : Name to use.
  - `wsPort` : The WS port for this node. (`9944` by default).
  - `port` : The TCP port for this node. (`30444` by default).
  - `image` : Image to use.
  - `command`: Command to run. (`polkadot-collator` by default).
  - `args` : An array of arguments to use as default to pass to the `command`.
