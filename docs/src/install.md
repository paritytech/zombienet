# Installation

ZombieNet releases are available in [github](https://github.com/paritytech/zombienet/releases). Each release provides executables for both `linux` and `macos` created with [pkg](https://github.com/vercel/pkg) and allows running `zombienet` cli *without* having `Node.js` installed. **But** each `provider` define its own requirements (e.g. k8s, podman).

## Using Binaries on MacOS

After you have downloaded `zombienet-macos-arm64` or `zombienet-macos-x64`, you will need to:

- Move the binary to your working directory.
- Rename the binary to just `zombienet` without any `macos-<version>` extension for convenience.
- Enable the binary to be executable:
	```bash
	chmod +x ./zombienet
	```
- Remove the binary from quarantine:
	```bash
	xattr -d com.apple.quarantine ./zombienet
	```

Then you should be able to access the binary:

```bash
./zombienet help
```

## Using NPM

If you have `Node.js`, you can install `zombienet` locally via NPM:

```bash
npm i @zombienet/cli@latest -g
```

Then you should be able to access the `zombienet` command:

```
zombienet help
```

## Using Nix

[Nix](https://nixos.org/) is a package manager which is available for both `linux` and `macos`.

The ZombieNet repository provides a `flake.nix` file, which can be used if you have [nix flakes enabled](https://nixos.wiki/wiki/Flakes#Enable_flakes). (e.g. `experimental-features = nix-command flakes` is in `~/.config/nix/nix.conf`). Use the flake reference `github:paritytech/zombienet` for the latest on `main`, or `github:paritytech/zombienet/<tag>` for a particular revision.

One way of using the nix flake is to use `nix run`. e.g. this command fetches the latest from `main` and builds `zombienet`:

```
nix run github:paritytech/zombienet -- spawn config.toml
```

Or a particular release can be specified. e.g. to run `v1.3.40`, use:

```
nix run github:paritytech/zombienet/v1.3.40 -- spawn config.toml
```

Another option is to add the `zombienet` binary to the `PATH` for the current shell. This can be done with:

```
nix shell github:paritytech/zombienet/v1.3.40
```
