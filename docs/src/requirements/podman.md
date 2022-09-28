# Podman requirements

Zombienet supports [Podman](https://podman.io/) _rootless_ as provider.
You only need to have `podman` installed in your environment to use it and either set it in the _network_ file or with the `--provider` flag in the CLI.

**Note:** `Podman` is supported in MacOS as an app but this is happening through an
internal vm. The provider's code in zombienet supports `podman` running native - thus `podman` for
`zombienet` can be used only on linux. This is related, mostly, to paths and directories used by
store configuration (chain-spec) and the data directory.
