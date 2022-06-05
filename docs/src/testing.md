# Testing

The other goal of ZombieNet is provide a way to perform test/assertions agins the spawned network, using a set of `natural language expressions` that allow to make assertions based on metrics, logs and some `built-in` function that query the network usin `polkadot.js`.
Those assertions should be defined in a *feature test*, and the `dsl` and format is documented in [here](./test-dsl-definition-spec.md).

The following is an small example to spawn a network (using the previos `simple network definition`) and assert that:
  - Both `nodes` are running
  - The definded `parachain` is registered
  - The defined `parachain` is producing blocks and produced at least 10 within 200 seconds.

```feature
Description: Simple Network Smoke Test
Network: ./0001-small-network.toml
Creds: config


alice: is up
bob: is up
alice: parachain 100 is registered within 225 seconds
alice: parachain 100 block height is at least 10 within 200 seconds
```

Another examples are provided in the [examples](https://github.com/paritytech/zombienet/tree/main/examples) directory.
