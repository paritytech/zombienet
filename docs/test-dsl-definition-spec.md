# Testing DSL

## Abstract

One of the goals of Zombienet it to provide a simple way to create tests, for that purpose we create a simple `DSL` that abstract the way to define tests using a defined set of assertions that allow users to make test based on:
- On chain storage
- Metrics
- Histograms
- Logs
- System events
- Tracing
- Custom api calls (through polkadot.js)
- Commands

Each of this abstractions are expresed by sentences defined in a *natural languaje style*, so each test line will be mapped to a test tu run.

Also, the test file (*.feature) includes a pre-defined *header fields* used to define information about the suite (e.g. `network configuration` and `credentials` location)

## Test Name

Zombienet use the `filename` as *test name* removing all leading number chars before the first `-` occuency. As explample a test filename `0001-dispute-valid-block.feature` will produce `dispute-valid-block` as test name and will be show in the report output of the test runner.


## Test file structure

The first lines are used to define the *header fields*:

- Description: ..... (Optional) long description of the test suite.
- Network: .......... Path to the network definition file, supported both `json` and `toml` formats.
- Creds: ............ Credentials file name or `path` to use (**Only** with `kubernetes` provider), we look in the current directory or in `$HOME/.kube/` if a filename is passed.

**Then** each line define a test `assertion` or a `commnad`.

### Available Assertions

- Well know functions: already mapped test function
  - `node-name`: *well-know_defined_test* [within x seconds]
    - alice: is up
    - alice: parachain 100 is registered within 225 seconds
    - alice: parachain 100 block height is at least 10 within 250 seconds

- Histogram assertion: Get metrics from prometheus, calculate the histogram and assert on the target value/s.
  - `node-name`: reports histogram `memtric_name` has *comparator target_value* samples in buckets ["bucket","bucket",...] [within x seconds]
    - alice: reports histogram polkadot_pvf_execution_time has at least 2 samples in buckets ["0.1", "0.25", "0.5", "+Inf"] within 100 seconds

- Metric assertion: Get metric from prometheus and assert on the target value.
  - `node-name`: reports `metric_name` *comparator target_value* (e.g "is at least x", "is greater than x") [within x seconds]
    - alice: reports node_roles is 4

- Logs assertions: Get logs from nodes and assert on the matching pattern (support `regex` and `glob`).
  - `node-name`: log line (contains|matches) ( regex|glob) "pattern" [within x seconds]
    - alice: log line matches glob "*rted #1*" within 10 seconds

- System events assertion: Find a `system event` from subscription by matching a `pattern`. *NOTE* the subscription is made when we start this particular test, so we **can not** match on event in the past.
  - `node-name`: system event (contains|matches)( regex| glob) "pattern" [within x seconds]
    - alice: system event matches "\"paraId\":[0-9]+" within 10 seconds

- Tracing assertion: Match an array of `span names` from the supplyed traceID. *NOTE* this is **not** supported with the native provider.
  - `node-name`: trace with traceID <id> contains ["name", "name2",...]
    - alice: trace with traceID 94c1501a78a0d83c498cc92deec264d9 contains ["answer-chunk-request", "answer-chunk-request"]

- Custom js scripts: Allow to run a defined script and assert on the completeness or return value.
  - `node-name`: js-script *script_relative_path* [ return is *comparator target_value*] [within x seconds]
    - alice: js-script ./0008-custom.js return is greater than 1 within 200 seconds

- Backchannel wait for value and register to use
  - node-name: wait for `var name` and use as `X` [within 30 seconds]
    - alice: wait for name and use as X within 30 seconds

### Commands (Only works with podman and kubernetes providers)

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
