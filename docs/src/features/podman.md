# Podman

With `podman` ZombieNet deploy a couple of extra pods to add a layer of monitoring/visibility to the running network. In particular pods for `prometheus`, `tempo` and `grafana` are deployed. Also, `grafana` is configured to have `prometheus` and `tempo` as datasource.

To access those services you can find the `url` in the output of zombinet

```bash
  Monitor: prometheus - url: http://127.0.0.1:34123

  Monitor: tempo - url: http://127.0.0.1:34125

  Monitor: grafana - url: http://127.0.0.1:41461
```

*Note*: Grafana is deployed with the default admin access.

Once the network is stopped, by ctrl+c on a running spawn or by finishing the test, these pods are removed with the rest of the pods launched by ZombieNet.
