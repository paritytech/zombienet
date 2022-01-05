# Testing DSL

## Abstract

Zombienet will provide a simple `DSL` to define a `test` feature in a natural language, allowing users to define in a `single file` both the desired `network configuration` and the `assertions` / `commands` to run.

## Test file structure

The first lines are used to define:
Description: .... (Optional) long description of the test suite.
Network: ......... Path to the network definition file, supported both `json` and `toml` formats.
Creds: ........... Credentials file name or `path` to use (**Only** with `kubernetes` provider), we look in the current directory or in `$HOME/.kube/` if a filename is passed.

Then each line define a test `assertion` or a `commnad` with the following patterns:

### Assertions

- Already mapped test function (a.k.a well defined tests)

  - node-name: well-know defined test (e.g "is up")
    - alice: is up

- Reports interface to get metrics from prometheus
  - node-name: reports `metric name` `comparator`(e.g "is at least x", "is greater than x") [within x seconds]
    - alice: reports node_roles is 4

- Access to Jaeger spans (TBD)
  - node-name: register `span query` [TODO]

- Backchannel wait for value and register to use
  - node-name: wait for `var name` and use as `X` [within 30 seconds]
    - alice: wait for name and use as X within 30 seconds

### Commands

  Commands allow to interact with the nodes, given the ability to run some pre-defined commands or an arbitary command in the node.

- restart
  - node-name: restart [after x seconds]
    Will stop the `process` and start again after the `x` amount of seconds or innmediatly.
  - node-name: pause
    Will pause (SIGSTOP) the process
  - node-name: resume
    Will pause (SIGCONT) the process

  - sleep x
    Will sleep the test-runner for `x` ammount of seconds.

## Test Name

We will use the `filename` as _test name_ removing all leading number chars before the first `-` occuency. As explample a test filename `0001-dispute-valid-block.feature` will produce `dispute-valid-block` as test name.
