# Convert

The `convert` command is a CLI command designed to help users convert their a `Polkadot Launch` configuration to the ` Zombienet` configuration format. This tool is especially helpful for developers to migrate their projects to to Zombienet, without the need to manually rewrite their configurations.

### Usage

```bash
zombienet convert <INPUT_FILE>
```

**Note**: Where ```<INPUT_FILE>``` is a Polkadot Launch configuration with a .js or .json extension defined by [this type](https://github.com/paritytech/polkadot-launch/blob/295a6870dd363b0b0108e745887f51e7141d7b5f/src/types.d.ts#L10)

### Example

Suppose you have a Polkadot Launch configuration file named `my-project-config.json`. To convert it to a Zombienet configuration file named `my-project-config-zombienet.json`, run:

```bash
zombienet convert my-project-config.json
```

### Notes

- The `convert` command will attempt to preserve as much information as possible from the original Polkadot Launch configuration file. However, due to the differences in the configuration structure and options between the two systems, some manual adjustments may be necessary after the conversion.
- It is recommended to thoroughly review the generated Zombienet configuration file to ensure that all the settings are correct and to make any necessary adjustments before using it to deploy your project.