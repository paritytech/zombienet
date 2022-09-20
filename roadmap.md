Roadmap Zombienet v2

## Infra
- Chaos testing, add examples and explore possibilities in `native` and `podman` provider
- Add `docker` provider
- Add `nomad` provider
- Create helm chart to allow other use zombienet in k8s
- Auth system to not use k8s users
- Create GitHub Action and publish in marketplace (wip)

## Internal teams
- Add more teams (wip)

## UI
- Create UI to create `.feature` (`.zndls`) and `network` files.
- Create script to translate from polkadot launch config to zombienet network file. ([wip](https://github.com/paritytech/zombienet/tree/nik-convert-polkadot-launch-config-to-zombienet))
- Improve VSCode extension (grammar/snippets/syntax highlighting) ([repo](https://github.com/paritytech/zombienet-vscode-extension))

## Registry
- Create decorators registry and allow override by paras (wip)
- Explore how to get info from paras.

## Functional tasks
- Add subxt integration, allow to compile/run on the fly
- Move parser to pest (wip)
- Detach phases and use JSON to communicate instead of `paths`
- Add relative values assertions (for metrics/scripts)
- Allow to define nodes that are not started in the launching phase and can be started by the test-runner
- Allow to define `race` assertions
- Rust integration -> Create multiples libs (crates)
- Explore backchannel use case
- Add support to run test agains a running network (wip)
- Add more CLI subcommands
- Add js/subxt snippets ready to use in assertions (e.g transfers)
- Add XCM support in built-in assertions
