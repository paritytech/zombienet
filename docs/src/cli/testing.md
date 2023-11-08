# Testing

The other goal of ZombieNet is to provide a way to perform test/assertions against the spawned network, using a set of `natural language expressions` that allow making assertions based on metrics, logs and some `built-in` function that query the network using `polkadot.js`.
Those assertions should be defined in a _feature test_, and the `dsl` and format is documented in [here](./test-dsl-definition-spec.md).

The following is a small example to spawn a network (using the previous `simple network definition`) and assert that:

**Note:** before spawning varify that `kubectl`'s namespace is set to `default`
```bash
❯ kubectl config get-contexts

CURRENT   NAME                   CLUSTER          AUTHINFO         NAMESPACE
*         docker-desktop         docker-desktop   docker-desktop   default

# if not then set it to default value

❯ kubectl config set-context --current --namespace='default'
```

- Both `nodes` are running
- The defined `parachain` is registered
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

Other examples are provided in the [examples](https://github.com/paritytech/zombienet/tree/main/examples) directory.
