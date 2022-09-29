# Podman requirements

Zombienet supports [Podman](https://podman.io/) _rootless_ as provider.
You only need to have `podman` installed in your environment to use it and either set it in the _network_ file or with the `--provider` flag in the CLI.

**Note:** Currently, it is only possible to use `podman` for Zombienet users on Linux machines. 
Although `podman` comes with support for macOS, it is done using an internal VM and the Zombienet provider code expects `podman` to be running natively.
