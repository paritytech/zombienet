# Testing DSL

## Abstract

Zombie-net will provide a simple `DSL` to define a `test` feature in a natural language, allowing users to define in a `single file` both the desired `network configuration` and the `assertions` to run.

## Test file structure

The first lines are used to define:
Description: <> .... (Optional) long description of the test suite.
Network: <> ......... Path to the network definition file, supported both `json` and `toml` formats.
Creds: <> ........... Credentials file name or `path` to use (with `kubectl`), we look in the current directory or in `$HOME/.kube/` if a filename is passed.

Then each line define a test assertion with the following patterns:

- Already mapped test function (a.k.a well defined tests)

  - <node-name>: <well defined test> (e.g "is up")

- Reports interface to get metrics from prometheus
  - <node-name>: reports <metric name> <comparator>(e.g "is at least x", "is greater than x") [within x seconds]
- Access to Jaeger spans (TBD)
  - <node-name>: register <span query> [TODO]
- Backchannel assert through api
  - <node-name>:



## Test Name

We will use the `filename` as _test name_ removing all leading number chars before the first `-` occuency. As explample a test filename `0001-dispute-valid-block.feature` will produce `dispute-valid-block` as test name.
