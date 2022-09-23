const chai = require("chai");
import Mocha from "mocha";
import fs from "fs";
import path from "path";
import { ApiPromise, Keyring } from "@polkadot/api";
const utilCrypto = require("@polkadot/util-crypto");
import { LaunchConfig } from "../types";
import { getLokiUrl, isValidHttpUrl, sleep } from "../utils/misc";
import { readNetworkConfig } from "../utils/fs";
import { Network, rebuildNetwork } from "../network";
import { decorators } from "../utils/colors";
import {
  DEFAULT_GLOBAL_TIMEOUT,
  DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
} from "../constants";
import minimatch from "minimatch";
import { Providers } from "../providers/";

import zombie from "../";
const {
  connect,
  chainUpgradeFromUrl,
  chainUpgradeFromLocalFile,
  chainCustomSectionUpgrade,
  validateRuntimeCode,
  findPatternInSystemEventSubscription,
} = require("../jsapi-helpers");

const debug = require("debug")("zombie::test-runner");

const { assert, expect } = chai;
const { Test, Suite } = Mocha;
const mocha = new Mocha();

import { JSDOM } from "jsdom";
import { Environment } from "nunjucks";
import { RelativeLoader } from "../utils/nunjucks-relative-loader";

interface TestDefinition {
  networkConfig: string;
  creds: string;
  description?: string;
  assertions: string[];
}

export interface BackchannelMap {
  [propertyName: string]: any;
}

export async function run(
  testFile: string,
  provider: string,
  inCI: boolean = false,
  concurrency: number = 1,
  runningNetworkSpecPath: string | undefined,
) {
  let network: Network;
  let backchannelMap: BackchannelMap = {};
  // read test file
  const testDef = parseTestFile(testFile);
  const testName = getTestNameFromFileName(testFile);
  let suiteName: string = testName;
  if (testDef.description) suiteName += `( ${testDef.description} )`;

  // read network file
  let config: LaunchConfig;
  if (fs.existsSync(testDef.networkConfig)) {
    config = readNetworkConfig(testDef.networkConfig);
  } else {
    // the path is relative to the test file
    const fileTestPath = path.dirname(testFile);
    const resolvedFilePath = path.resolve(fileTestPath, testDef.networkConfig);
    config = readNetworkConfig(resolvedFilePath);
  }

  // set the provider
  if (!config.settings)
    config.settings = { provider, timeout: DEFAULT_GLOBAL_TIMEOUT };
  else config.settings.provider = provider;

  // find creds file
  let credsFile = inCI ? "config" : testDef.creds;
  let creds: string | undefined;
  if (fs.existsSync(credsFile)) creds = credsFile;
  else {
    const possiblePaths = [
      ".",
      "..",
      `${process.env.HOME}/.kube`,
      "/etc/zombie-net",
    ];
    let credsFileExistInPath: string | undefined = possiblePaths.find(
      (path) => {
        const t = `${path}/${credsFile}`;
        return fs.existsSync(t);
      },
    );
    if (credsFileExistInPath) creds = credsFileExistInPath + "/" + credsFile;
  }

  if (!creds && config.settings.provider === "kubernetes")
    throw new Error(`Invalid credential file path: ${credsFile}`);

  // create suite
  const suite = Suite.create(mocha.suite, suiteName);

  suite.beforeAll("launching", async function () {
    const launchTimeout = config.settings?.timeout || 500;
    this.timeout(launchTimeout * 1000);
    try {
      if (runningNetworkSpecPath)
        console.log("runningNetworkSpecPath", runningNetworkSpecPath);
      if (!runningNetworkSpecPath) {
        console.log(`\t Launching network... this can take a while.`);
        network = await zombie.start(creds!, config, {
          spawnConcurrency: concurrency,
          inCI,
        });
      } else {
        const runningNetworkSpec: any = require(runningNetworkSpecPath);
        if (provider !== runningNetworkSpec.client.providerName)
          throw new Error(
            `Invalid provider, the provider set doesn't match with the running network definition`,
          );

        const { namespace, tmpDir } = runningNetworkSpec;
        // initialize the Client
        const client = Providers.get(
          runningNetworkSpec.client.providerName,
        ).initClient(
          runningNetworkSpec.client.configPath,
          runningNetworkSpec.namespace,
          runningNetworkSpec.tmpDir,
        );
        // initialize the network
        network = rebuildNetwork(client, runningNetworkSpec);
      }

      network.showNetworkInfo(config.settings.provider);

      await sleep(5 * 1000);
      return;
    } catch (err) {
      console.log(`\n${decorators.red("Error launching the network!")}`);
      console.log(`\t ${err}`);
      exitMocha(100);
    }
  });

  suite.afterAll("teardown", async function () {
    this.timeout(180 * 1000);
    if (network && !network.wasRunning) {
      const logsPath = await network.dumpLogs(false);
      const tests = this.test?.parent?.tests;
      if (tests) {
        const failed = tests.filter((test) => {
          return test.state !== "passed";
        });
        if (failed.length) {
          console.log(
            `\n\n\t${decorators.red(
              "Hey one or more of your test failed, to see the full logs of the nodes please go to:",
            )}`,
          );

          switch (network.client.providerName) {
            case "podman":
            case "native":
              console.log(`\n\t${decorators.magenta(logsPath)}`);
              console.log(`\n\t ${decorators.green("Deleting network")}`);
              await network.stop();
              break;
            case "kubernetes":
              if (inCI) {
                // show links to grafana and also we need to move the logs to artifacts
                const networkEndtime = new Date().getTime();
                for (const node of network.relay) {
                  const loki_url = getLokiUrl(
                    network.namespace,
                    node.name,
                    network.networkStartTime!,
                    networkEndtime,
                  );
                  console.log(
                    `\t${decorators.magenta(node.name)}: ${decorators.green(
                      loki_url,
                    )}`,
                  );
                }

                for (const [paraId, parachain] of Object.entries(
                  network.paras,
                )) {
                  console.log(`\n\tParaId: ${decorators.magenta(paraId)}`);
                  for (const node of parachain.nodes) {
                    const loki_url = getLokiUrl(
                      network.namespace,
                      node.name,
                      network.networkStartTime!,
                      networkEndtime,
                    );
                    console.log(
                      `\t\t${decorators.magenta(node.name)}: ${decorators.green(
                        loki_url,
                      )}`,
                    );
                  }
                }

                // logs are also collaected as artifacts
                console.log(
                  `\n\n\t ${decorators.yellow(
                    "Logs are also available in the artifacts' pipeline in gitlab",
                  )}`,
                );
              } else {
                console.log(`\n\t${decorators.magenta(logsPath)}`);
              }
              // keep pods running for 30 mins.
              console.log(
                `\n\t${decorators.yellow(
                  "One or more test failed, we will keep the namespace up for 30 more minutes",
                )}`,
              );
              await network.upsertCronJob(30);
              break;
          }
        } else {
          // All test passed, just remove the network
          console.log(`\n\t ${decorators.green("Deleting network")}`);
          await network.stop();
        }
      }
    }
    return;
  });

  for (const assertion of testDef.assertions) {
    const testFn = parseAssertionLine(assertion);
    if (!testFn) continue;
    const test = new Test(
      assertion,
      async () => await testFn(network, backchannelMap, testFile),
    );
    suite.addTest(test);
    test.timeout(0);
  }

  // run
  mocha.run(exitMocha);
}

// extracted from mocha test runner helper.
const exitMocha = (code: number) => {
  console.log("exit code", code);
  const clampedCode = Math.min(code, 255);
  let draining = 0;

  // Eagerly set the process's exit code in case stream.write doesn't
  // execute its callback before the process terminates.
  process.exitCode = clampedCode;

  // flush output for Node.js Windows pipe bug
  // https://github.com/joyent/node/issues/6247 is just one bug example
  // https://github.com/visionmedia/mocha/issues/333 has a good discussion
  const done = () => {
    if (!draining--) {
      process.exit(clampedCode);
    }
  };

  const streams = [process.stdout, process.stderr];

  streams.forEach((stream) => {
    // submit empty write request and wait for completion
    draining += 1;
    stream.write("", done);
  });

  done();
};

// REGEX
// Node general
const isUpRegex = new RegExp(
  /^(([\w-]+): is up)+( within (\d+) (seconds|secs|s)?)?$/i,
);

// parachains
const parachainIsRegistered = new RegExp(
  /^(([\w-]+): parachain (\d+) is registered)+( within (\d+) (seconds|secs|s)?)?$/i,
);
const parachainBlockHeight = new RegExp(
  /^(([\w-]+): parachain (\d+) block height is (equal to|equals|=|==|greater than|>|at least|>=|lower than|<)? *(\d+))+( within (\d+) (seconds|secs|s))?$/i,
);
const chainUpgradeRegex = new RegExp(
  /^(([\w-]+): parachain (\d+) perform upgrade with (.*?))+( within (\d+) (seconds|secs|s)?)$/i,
);
const chainDummyUpgradeRegex = new RegExp(
  /^(([\w-]+): parachain (\d+) perform dummy upgrade)+( within (\d+) (seconds|secs|s)?)$/i,
);

// Metrics - histograms
// e.g alice: reports histogram pvf_execution_time has at last X samples in buckets ["3", "4", "6", "+Inf"]
const isHistogram = new RegExp(
  /^(([\w-]+): reports histogram (.*?) has (equal to|equals|=|==|greater than|>|at least|>=|lower than|<)? *(\d+) samples in buckets \[(.+)\])+( within (\d+) (seconds|secs|s))?$/i,
);

// Metrics
const isReports = new RegExp(
  /^(([\w-]+): reports (.*?) is (equal to|equals|=|==|greater than|>|at least|>=|lower than|<)? *(\d+))+( within (\d+) (seconds|secs|s))?$/i,
);

// Logs assertion
const assertLogLineRegex = new RegExp(
  /^(([\w-]+): log line (contains|matches)( regex| glob)? "(.+)")+( within (\d+) (seconds|secs|s))?$/i,
);

// Tracing assertion
// alice: trace with traceID <id> contains ["name", "name2",...]
const isTracing = new RegExp(
  /^(([\w-]+): trace with traceID (.*?) contains \[(.+)\])+( within (\d+) (seconds|secs|s))?$/i,
);

// system events
const assertSystemEventRegex = new RegExp(
  /^(([\w-]+): system event (contains|matches)( regex| glob)? "(.+)")+( within (\d+) (seconds|secs|s))?$/i,
);

// Custom js-script
const assertCustomJsRegex = new RegExp(
  /^([\w-]+): js-script (\.{0,2}\/.*\.[\w]+)( with \"[\w ,-/]+\")?( return is (equal to|equals|=|==|greater than|>|at least|>=|lower than|<)? *(\d+))?( within (\d+) (seconds|secs|s))?$/i,
);

// Run command in the node
const assertCustomShInNode = new RegExp(
  /^([\w-]+): run (\.{0,2}\/.*\.[\w]+)( with \"[\w \,\-\/:.]+\")?( return is (equal to|equals|=|==|greater than|>|at least|>=|lower than|<)? *(\d+))?( within (\d+) (seconds|secs|s))?$/i,
);

// Backchannel
// alice: wait for name and use as X within 30s
const backchannelWait = new RegExp(
  /^([\w-]+): wait for (.*?) and use as (.*?) within (\d+) (seconds|secs|s)?$/i,
);

// Alice: ensure var:X is used
const isEnsure = new RegExp(/^([\w-]+): ensure var:([\w]+) is used$/i);

// Commands
const sleepRegex = new RegExp(/^sleep *(\d+) (seconds|secs|s)?$/i);
const restartRegex = new RegExp(
  /^(([\w-]+): restart)+( after (\d+) (seconds|secs|s))?$/i,
);
const pauseRegex = new RegExp(/^([\w-]+): pause$/i);
const resumeRegex = new RegExp(/^([\w-]+): resume$/i);

function parseAssertionLine(assertion: string) {
  // Matchs
  let m: string[] | null;

  m = parachainIsRegistered.exec(assertion);
  if (m && m[2] && m[3]) {
    const nodeName = m[2];
    const parachainId = parseInt(m[3], 10);
    let t: number;
    if (m[5]) t = parseInt(m[5], 10);

    return async (network: Network) => {
      const timeout: number | undefined = t;
      const nodes = network.getNodes(nodeName);
      const results = await Promise.all(
        nodes.map((node) => node.parachainIsRegistered(parachainId, timeout)),
      );

      const parachainIsRegistered = results.every(Boolean);
      expect(parachainIsRegistered).to.be.ok;
    };
  }

  m = parachainBlockHeight.exec(assertion);
  if (m && m[2] && m[3] && m[4] && m[5]) {
    let t: number;
    const nodeName = m[2];
    const parachainId = parseInt(m[3], 10);
    const comparatorFn = getComparatorFn(m[4] || "");
    const targetValue = parseInt(m[5]);
    if (m[7]) t = parseInt(m[7], 10);

    return async (network: Network) => {
      const timeout: number | undefined = t;
      const nodes = network.getNodes(nodeName);

      const results = await Promise.all(
        nodes.map((node) =>
          node.parachainBlockHeight(parachainId, targetValue, timeout),
        ),
      );
      for (const value of results) {
        assert[comparatorFn](value, targetValue);
      }
    };
  }

  m = isUpRegex.exec(assertion);
  if (m && m[2] !== null) {
    let t: number;
    const nodeName = m[2];
    if (m[4]) t = parseInt(m[4], 10);
    return async (network: Network) => {
      const timeout: number | undefined = t;
      const nodes = network.getNodes(nodeName);
      const results = await Promise.all(
        nodes.map((node) =>
          node.getMetric("process_start_time_seconds", "isAtLeast", 1, timeout),
        ),
      );
      const AllNodeUps = results.every(Boolean);
      expect(AllNodeUps).to.be.ok;
    };
  }

  m = isHistogram.exec(assertion);
  if (m && m[2] && m[3] && m[5]) {
    let t: number;
    const nodeName = m[2];
    const metricName = m[3];
    const comparatorFn = getComparatorFn(m[4] || "");
    const targetValue = parseInt(m[5]);
    const buckets = m[6].split(",").map((x) => x.replaceAll('"', "").trim());
    if (m[8]) t = parseInt(m[8], 10);
    return async (network: Network, backchannelMap: BackchannelMap) => {
      const timeout: number | undefined = t;
      const nodes = network.getNodes(nodeName);
      const results = await Promise.all(
        nodes.map((node) =>
          node.getHistogramSamplesInBuckets(
            metricName,
            buckets,
            targetValue,
            timeout,
          ),
        ),
      );

      for (const value of results) {
        assert[comparatorFn](value, targetValue);
      }
    };
  }

  // alice: trace with traceID <id> contains ["name", "name2",...]
  m = isTracing.exec(assertion);
  if (m && m[2] && m[3] && m[4]) {
    let t: number;
    const nodeName = m[2];
    const traceId = m[3];
    const spanNames = m[4].split(",").map((x) => x.replaceAll('"', "").trim());
    if (m[8]) t = parseInt(m[8], 10);
    return async (network: Network, backchannelMap: BackchannelMap) => {
      const _timeout: number | undefined = t;
      const nodes = network.getNodes(nodeName);
      const results = await Promise.all(
        nodes.map((node) =>
          node.getSpansByTraceId(traceId, network.tracing_collator_url!),
        ),
      );

      for (const value of results) {
        assert.includeOrderedMembers(value, spanNames);
      }
    };
  }

  m = isReports.exec(assertion);
  if (m && m[2] && m[3] && m[5]) {
    let t: number;
    const nodeName = m[2];
    const metricName = m[3];
    const comparatorFn = getComparatorFn(m[4] || "");
    const targetValue = parseInt(m[5]);
    if (m[7]) t = parseInt(m[7], 10);
    return async (network: Network, backchannelMap: BackchannelMap) => {
      const timeout: number | undefined = t;
      const nodes = network.getNodes(nodeName);
      const results = await Promise.all(
        nodes.map((node) =>
          node.getMetric(metricName, comparatorFn, targetValue, timeout),
        ),
      );

      for (const value of results) {
        assert[comparatorFn](value, targetValue);
      }
    };
  }

  m = assertLogLineRegex.exec(assertion);
  if (m && m[2] && m[5]) {
    let t: number;
    const nodeName = m[2];
    const pattern = m[5];
    const isGlob = (m[4] && m[4].trim() === "glob") || false;
    if (m[7]) t = parseInt(m[7], 10);

    return async (network: Network) => {
      const timeout: number | undefined = t;
      const nodes = network.getNodes(nodeName);
      const results = await Promise.all(
        nodes.map((node) => node.findPattern(pattern, isGlob, timeout)),
      );

      const found = results.every(Boolean);
      expect(found).to.be.ok;
    };
  }

  m = assertSystemEventRegex.exec(assertion);
  if (m && m[2] && m[5]) {
    const nodeName = m[2];
    const pattern = m[5];
    const isGlob = (m[4] && m[4].trim() === "glob") || false;
    const t = m[7] ? parseInt(m[7], 10) : DEFAULT_INDIVIDUAL_TEST_TIMEOUT;

    return async (network: Network) => {
      const timeout: number | undefined = t;
      const node = network.node(nodeName);
      const api: ApiPromise = await connect(node.wsUri);
      const re = isGlob ? minimatch.makeRe(pattern) : new RegExp(pattern, "ig");
      const found = await findPatternInSystemEventSubscription(
        api,
        re,
        timeout,
      );
      api.disconnect();

      expect(found).to.be.ok;
    };
  }

  m = assertCustomJsRegex.exec(assertion);
  if (m && m[1] && m[2]) {
    const nodeName = m[1];
    const jsFile = m[2];
    const withArgs = m[3] ? m[3] : "";
    const comparatorFn = getComparatorFn(m[5] || "");
    let targetValue: string | number | undefined = m[6];
    const timeout = m[8] ? parseInt(m[8], 10) : DEFAULT_INDIVIDUAL_TEST_TIMEOUT;

    return async (
      network: Network,
      backchannelMap: BackchannelMap,
      testFile: string,
    ) => {
      const networkInfo = {
        tmpDir: network.tmpDir,
        chainSpecPath: network.chainSpecFullPath,
        relay: network.relay.map((node) => {
          const { name, wsUri, prometheusUri, userDefinedTypes } = node;
          return { name, wsUri, prometheusUri, userDefinedTypes };
        }),
        paras: Object.keys(network.paras).reduce((memo: any, paraId: any) => {
          memo[paraId] = { chainSpecPath: network.paras[paraId].chainSpecPath };
          memo[paraId].nodes = network.paras[paraId].nodes.map((node) => {
            return { ...node };
          });
          return memo;
        }, {}),
        nodesByName: Object.keys(network.nodesByName).reduce(
          (memo: any, nodeName) => {
            const {
              name,
              wsUri,
              prometheusUri,
              userDefinedTypes,
              parachainId,
            } = network.nodesByName[nodeName];
            memo[nodeName] = { name, wsUri, prometheusUri, userDefinedTypes };
            if (parachainId) memo[nodeName].parachainId = parachainId;
            return memo;
          },
          {},
        ),
      };

      const nodes = network.getNodes(nodeName);
      const args =
        withArgs === ""
          ? []
          : withArgs.split("with ").slice(1)[0].replaceAll('"', "").split(",");
      const fileTestPath = path.dirname(testFile);
      const resolvedJsFilePath = path.resolve(fileTestPath, jsFile);

      // shim with jsdom
      const dom = new JSDOM(
        "<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>",
      );
      (global as any).window = dom.window;
      (global as any).document = dom.window.document;
      (global as any).zombie = {
        ApiPromise,
        Keyring,
        util: utilCrypto,
        connect,
      };
      const jsScript = await import(resolvedJsFilePath);

      let values;
      try {
        const resp: any = await Promise.race([
          Promise.all(
            nodes.map((node) => jsScript.run(node.name, networkInfo, args)),
          ),
          new Promise((resolve) =>
            setTimeout(() => {
              const err = new Error(
                `Timeout(${timeout}), "custom-js ${jsFile} within ${timeout} secs" didn't complete on time.`,
              );
              return resolve(err);
            }, timeout * 1000),
          ),
        ]);
        if (resp instanceof Error) throw new Error(resp as any);
        else values = resp;
      } catch (err: any) {
        console.log(
          `\n\t ${decorators.red(`Error running script: ${jsFile}`)}`,
        );
        console.log(`\t\t ${err.message}\n`);
        throw new Error(err);
      }

      // remove shim
      (global as any).window = undefined;
      (global as any).document = undefined;
      (global as any).zombie = undefined;

      if (targetValue) {
        if (comparatorFn !== "equals")
          targetValue = parseInt(targetValue as string, 10);
        for (const value of values) {
          assert[comparatorFn](value, targetValue);
        }
      } else {
        // test don't have matching output
        expect(true).to.be.ok;
      }
    };
  }

  m = assertCustomShInNode.exec(assertion);
  if (m && m[1] && m[2]) {
    const nodeName = m[1];
    const shFile = m[2];
    const withArgs = m[3] ? m[3] : "";
    const comparatorFn = getComparatorFn(m[5] || "");
    let targetValue: string | number | undefined = m[6];
    const t = m[8] ? parseInt(m[8], 10) : DEFAULT_INDIVIDUAL_TEST_TIMEOUT;

    return async (
      network: Network,
      backchannelMap: BackchannelMap,
      testFile: string,
    ) => {
      try {
        const timeout: number | undefined = t;
        const fileTestPath = path.dirname(testFile);
        const resolvedShFilePath = path.resolve(fileTestPath, shFile);

        const nodes = network.getNodes(nodeName);
        const args =
          withArgs === ""
            ? []
            : withArgs
                .split("with ")
                .slice(1)[0]
                .replaceAll('"', "")
                .split(",");
        const results = await Promise.all(
          nodes.map((node) => node.run(resolvedShFilePath, args, timeout)),
        );

        if (comparatorFn && targetValue !== undefined) {
          for (const value of results) {
            assert[comparatorFn](value, targetValue);
          }
        }

        // all the commands run successfully
        expect(true).to.be.ok;
      } catch (err: any) {
        console.log(
          `\n\t ${decorators.red(`Error running script: ${shFile}`)}`,
        );
        console.log(`\t\t ${err.message}\n`);
        throw new Error(err);
      }
    };
  }

  m = backchannelWait.exec(assertion);
  if (m && m[1] && m[2] && m[3]) {
    let timeout: number;
    const backchannelKey = m[2];
    const backchannelMapKey = m[3]; // for use locally after with `var:KEY`
    if (m[4]) timeout = parseInt(m[4]);
    return async (network: Network, backchannelMap: BackchannelMap) => {
      try {
        const value = await network.getBackchannelValue(
          backchannelKey,
          timeout,
        );
        backchannelMap[backchannelMapKey] = value;
        // return ok
        assert.equal(0, 0);
      } catch (err) {
        throw new Error(`Error getting ${backchannelKey} from backchannel`);
      }
    };
  }

  m = isEnsure.exec(assertion);
  if (m && m[1] && m[2]) {
    const backchannelMapKey = m[2]; // for use locally after with `var:KEY`
    return async (network: Network, backchannelMap: BackchannelMap) => {
      const defined = backchannelMap[backchannelMapKey] !== undefined;
      expect(defined).to.be.ok;
    };
  }

  m = restartRegex.exec(assertion);
  if (m && m[2]) {
    const nodeName = m[2];
    let t: number;
    if (m[4]) t = parseInt(m[4], 10);
    return async (network: Network, backchannelMap: BackchannelMap) => {
      const timeout: number | undefined = t;
      const nodes = network.getNodes(nodeName);
      const results = await Promise.all(
        nodes.map((node) => node.restart(timeout)),
      );

      for (const value of results) {
        expect(value).to.be.ok;
      }
    };
  }

  m = pauseRegex.exec(assertion);
  if (m && m[1]) {
    const nodeName = m[1];
    return async (network: Network, backchannelMap: BackchannelMap) => {
      const nodes = network.getNodes(nodeName);
      const results = await Promise.all(nodes.map((node) => node.pause()));

      for (const value of results) {
        expect(value).to.be.ok;
      }
    };
  }

  m = resumeRegex.exec(assertion);
  if (m && m[1]) {
    const nodeName = m[1];
    return async (network: Network, backchannelMap: BackchannelMap) => {
      const nodes = network.getNodes(nodeName);
      const results = await Promise.all(nodes.map((node) => node.resume()));

      for (const value of results) {
        expect(value).to.be.ok;
      }
    };
  }

  m = sleepRegex.exec(assertion);
  if (m && m[1]) {
    const timeout = parseInt(m[1], 10);
    return async () => {
      await sleep(timeout * 1000);
      expect(true).to.be.ok;
    };
  }

  m = chainUpgradeRegex.exec(assertion);
  if (m && m[2]) {
    const nodeName = m[2];
    const parachainId = parseInt(m[3], 10);
    const upgradeFileOrUrl = m[4];
    let timeout: number;
    if (m[6]) timeout = parseInt(m[6], 10);

    return async (
      network: Network,
      backchannelMap: BackchannelMap,
      testFile: string,
    ) => {
      let node = network.node(nodeName);
      let api: ApiPromise = await connect(node.wsUri);
      let hash;

      if (isValidHttpUrl(upgradeFileOrUrl)) {
        hash = await chainUpgradeFromUrl(api, upgradeFileOrUrl);
      } else {
        const fileTestPath = path.dirname(testFile);
        const resolvedJsFilePath = path.resolve(fileTestPath, upgradeFileOrUrl);
        hash = await chainUpgradeFromLocalFile(api, resolvedJsFilePath);
      }

      // validate in a node of the relay chain
      api.disconnect();
      const { wsUri, userDefinedTypes } = network.relay[0];
      api = await connect(wsUri, userDefinedTypes);
      const valid = await validateRuntimeCode(api, parachainId, hash, timeout);
      api.disconnect();

      expect(valid).to.be.ok;
    };
  }

  m = chainDummyUpgradeRegex.exec(assertion);
  if (m && m[2]) {
    const nodeName = m[2];
    const parachainId = parseInt(m[3], 10);
    let timeout: number;
    if (m[5]) timeout = parseInt(m[5], 10);

    return async (
      network: Network,
      backchannelMap: BackchannelMap,
      testFile: string,
    ) => {
      const collator = network.paras[parachainId].nodes[0];
      let node = network.node(collator.name);
      let api: ApiPromise = await connect(node.wsUri);
      const hash = await chainCustomSectionUpgrade(api);

      // validate in the <node>: of the relay chain
      node = network.node(nodeName);
      api = await connect(node.wsUri);
      const valid = await validateRuntimeCode(api, parachainId, hash, timeout);
      api.disconnect();

      expect(valid).to.be.ok;
    };
  }

  // if we can't match let produce a fail test
  return async (network: Network) => {
    console.log(
      `\n\t ${decorators.red("Failed to match, please check syntax.")}`,
    );
    assert.equal(0, 1);
  };
}

function getComparatorFn(comparator: string) {
  let fn;
  switch (comparator.trim()) {
    case "equals":
    case "=":
    case "==":
    case "equal to":
      fn = "equal";
      break;
    case "greater than":
    case ">":
      fn = "isAbove";
      break;
    case "at least":
    case ">=":
      fn = "isAtLeast";
      break;
    case "lower than":
    case "<":
      fn = "isBelow";
      break;
    case "<=":
      fn = "isAtMost";
      break;
    default: //default
      fn = "equal";
      break;
  }

  return fn;
}

function getTestNameFromFileName(testFile: string): string {
  const fileWithOutExt = testFile.split(".")[0];
  const fileName: string = fileWithOutExt.split("/").pop() || "";
  const parts = fileName.split("-");
  const name = parts[0].match(/\d/)
    ? parts.slice(1).join(" ")
    : parts.join(" ");
  return name;
}

function parseTestFile(testFile: string): TestDefinition {
  let testDefinition: TestDefinition | undefined = undefined;

  const configBasePath = path.dirname(testFile);
  const env = new Environment(new RelativeLoader([configBasePath]));
  const temmplateContent = fs.readFileSync(testFile).toString();
  const content = env.renderString(temmplateContent, process.env);

  let networkConfig: string = "";
  let description: string = "";
  let creds: string = "";
  const assertions = [];

  for (let line of content.split("\n")) {
    line = line.trim();
    if (line[0] === "#" || line.length === 0) continue; // skip comments and empty lines;
    let parts = line.split(":");
    if (parts.length < 2 && !line.includes("sleep")) continue; // bad line
    switch (parts[0].toLocaleLowerCase()) {
      case "network":
        networkConfig = parts[1].trim();
        break;
      case "creds":
        creds = parts[1].trim();
        break;
      case "description":
        description = parts[1].trim();
        break;
      default:
        assertions.push(line);
        break;
    }
  }

  const required = ["Network", "Creds"];
  const missing = required.filter((value) => {
    if (value === "Network" && !networkConfig) return true;
    if (value === "Creds" && !creds) return true;
  });

  if (missing.length > 0)
    throw new Error(
      `Invalid test definition, missing: ${required.join(
        ",",
      )}. file: ${testFile}`,
    );

  testDefinition = {
    networkConfig,
    creds,
    assertions,
    description,
  };

  // extra check
  if (!testDefinition)
    throw new Error(`Invalid test definition, file: ${testFile}`);
  return testDefinition;
}
