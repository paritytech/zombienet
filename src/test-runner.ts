const chai = require("chai");
import Mocha from "mocha";
import fs from "fs";
import { LaunchConfig } from "./types";
import { readNetworkConfig, sleep } from "./utils";
import { Network } from "./network";
import path from "path";
import { decorators } from "./colors";
import { ApiPromise } from "@polkadot/api";
const zombie = require("../");
const {connect, chainUpgrade, chainDummyUpgrade, validateRuntimeCode} = require("./jsapi-helpers");

const debug = require("debug")("zombie::test-runner");

const { assert, expect } = chai;
const { Test, Suite } = Mocha;
const mocha = new Mocha();

interface TestDefinition {
  networkConfig: string;
  creds: string;
  description?: string;
  assertions: string[];
}

export interface BackchannelMap {
  [propertyName: string]: any;
}

export async function run(testFile: string, provider: string,  isCI: boolean = false) {
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
  config.settings.provider = provider;

  // find creds file
  let credsFile = isCI ? "config" : testDef.creds;
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
      }
    );
    if (credsFileExistInPath) creds = credsFileExistInPath + "/" + credsFile;
  }

  if (!creds && config.settings.provider === "kubernetes") throw new Error(`Invalid credential file path: ${credsFile}`);

  // create suite
  const suite = Suite.create(mocha.suite, suiteName);

  suite.beforeAll("launching", async function () {
    console.log(`\t Launching network... this can take a while.`);
    const launchTimeout = config.settings?.timeout || 500;
    this.timeout(launchTimeout * 1000);
    network = await zombie.start(creds, config);

    network.showNetworkInfo();
    return;
  });

  suite.afterAll("teardown", async function () {
    this.timeout(180 * 1000);
    if (network) {
      await network.uploadLogs();
      const tests = this.test?.parent?.tests;
      if(tests) {
        const fail = tests.find(test => {test.state !== "passed"});
        if(fail) {
          // keep the namespace up for 1 hour
          console.log(`\n\t ${decorators.yellow("Some test fail, we will keep the namespace up for 30 more minutes")}`);
          await network.upsertCronJob(30);
        } else {
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
      async () => await testFn(network, backchannelMap, testFile)
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

function parseAssertionLine(assertion: string) {
  // parachains smoke test
  const isUpRegex = new RegExp(/^([\w]+): is up$/i);
  const parachainIsRegistered = new RegExp(
    /^(([\w]+): parachain (\d+) is registered)+( within (\d+) (seconds|secs|s)?)?$/i
  );
  const parachainBlockHeight = new RegExp(
    /^(([\w]+): parachain (\d+) block height is (equal to|equals|=|==|greater than|>|at least|>=|lower than|<)? *(\d+))+( within (\d+) (seconds|secs|s))?$/i
  );
  const chainUpgradeRegex = new RegExp(/^(([\w]+): parachain (\d+) perform upgrade with (.*?))+( within (\d+) (seconds|secs|s)?)$/i);
  const chainDummyUpgradeRegex = new RegExp(/^(([\w]+): parachain (\d+) perform dummy upgrade)+( within (\d+) (seconds|secs|s)?)$/i);

  // Metrics
  const isReports = new RegExp(
    /^(([\w]+): reports (.*?) is (equal to|equals|=|==|greater than|>|at least|>=|lower than|<)? *(\d+))+( within (\d+) (seconds|secs|s))?$/i
  );

  // Backchannel
  // alice: wait for name and use as X within 30s
  const backchannelWait = new RegExp(
    /^([\w]+): wait for (.*?) and use as (.*?) within (\d+) (seconds|secs|s)?$/i
  );

  // Alice: ensure var:X is used
  const isEnsure = new RegExp(/^([\w]+): ensure var:([\w]+) is used$/i);

  // Commands
  const sleepRegex = new RegExp(/^sleep *(\d+) (seconds|secs|s)?$/i);
  const restartRegex = new RegExp(
    /^(([\w]+): restart)+( after (\d+) (seconds|secs|s))?$/i
  );
  const pauseRegex = new RegExp(/^([\w]+): pause$/i);
  const resumeRegex = new RegExp(/^([\w]+): resume$/i);

  // Matchs
  let m: string[] | null;

  m = parachainIsRegistered.exec(assertion);
  if (m && m[2] && m[3]) {
    const nodeName = m[2];
    const parachainId = parseInt(m[3], 10);
    let timeout: number;
    if (m[5]) timeout = parseInt(m[5], 10);

    return async (network: Network) => {
      const parachainIsRegistered = timeout
        ? await network
            .node(nodeName)
            .parachainIsRegistered(parachainId, timeout)
        : await network.node(nodeName).parachainIsRegistered(parachainId);

      expect(parachainIsRegistered).to.be.ok;
    };
  }

  m = parachainBlockHeight.exec(assertion);
  if (m && m[2] && m[3] && m[4] && m[5]) {
    let timeout: number;
    const nodeName = m[2];
    const parachainId = parseInt(m[3], 10);
    const comparatorFn = getComparatorFn(m[4] || "");
    const targetValue = parseInt(m[5]);
    if (m[7]) timeout = parseInt(m[7], 10);

    return async (network: Network) => {
      const value = timeout
        ? await network
            .node(nodeName)
            .parachainBlockHeight(parachainId, targetValue, timeout)
        : await network
            .node(nodeName)
            .parachainBlockHeight(parachainId, targetValue);

      assert[comparatorFn](value, targetValue);
    };
  }

  m = isUpRegex.exec(assertion);
  if (m && m[1] !== null) {
    const nodeName = m[1];
    return async (network: Network) => {
      // const isUp = await network.node(nodeName).isUp();
      // expect(isUp).to.be.ok;
      await network.node(nodeName).getMetric("process_start_time_seconds");
      return true;
    };
  }

  m = isReports.exec(assertion);
  if (m && m[2] && m[3] && m[5]) {
    let timeout: number;
    let value: number;
    const nodeName = m[2];
    const metricName = m[3];
    const comparatorFn = getComparatorFn(m[4] || "");
    const targetValue = parseInt(m[5]);
    if (m[7]) timeout = parseInt(m[7], 10);
    return async (network: Network, backchannelMap: BackchannelMap) => {
      let value;
      try {
        value = timeout
          ? await network
              .node(nodeName)
              .getMetric(metricName, targetValue, timeout)
          : await network.node(nodeName).getMetric(metricName);
      } catch (err) {
        if (comparatorFn === "equal" && targetValue === 0) value = 0;
        else throw err;
      }
      assert[comparatorFn](value, targetValue);
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
          timeout
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
    let timeout: number;
    if (m[4]) timeout = parseInt(m[4], 10);
    return async (network: Network, backchannelMap: BackchannelMap) => {
      if (timeout) await network.node(nodeName).restart(timeout);
      else await network.node(nodeName).restart();
      expect(true).to.be.ok;
    };
  }

  m = pauseRegex.exec(assertion);
  if (m && m[2]) {
    const nodeName = m[2];
    return async (network: Network, backchannelMap: BackchannelMap) => {
      await network.node(nodeName).pause();
      expect(true).to.be.ok;
    };
  }

  m = resumeRegex.exec(assertion);
  if (m && m[2]) {
    const nodeName = m[2];
    return async (network: Network, backchannelMap: BackchannelMap) => {
      await network.node(nodeName).resume();
      expect(true).to.be.ok;
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
    const upgradeFilePath = m[4];
    let timeout: number;
    if (m[6]) timeout = parseInt(m[6], 10);

    return async (network: Network, backchannelMap: BackchannelMap, testFile: string) => {
      const node = network.node(nodeName);
      const api: ApiPromise = await connect(node.wsUri);

      let resolvedUpgradeFilePath;
      try {
        if (fs.existsSync(upgradeFilePath)) {
          const dir = path.dirname(upgradeFilePath);
          resolvedUpgradeFilePath = path.resolve(dir, upgradeFilePath);
        } else {
          // the path is relative to the test file
          const fileTestPath = path.dirname(testFile);
          resolvedUpgradeFilePath = path.resolve(fileTestPath, upgradeFilePath);
        }
        await chainUpgrade(api,resolvedUpgradeFilePath);
      } catch(e) {
        throw new Error(`Error upgrading chain with file: ${resolvedUpgradeFilePath}`);
      }
      expect(true).to.be.ok;
    };
  }


  m = chainDummyUpgradeRegex.exec(assertion);
  if (m && m[2]) {
    const nodeName = m[2];
    const parachainId = parseInt(m[3], 10);
    let timeout: number;
    if (m[5]) timeout = parseInt(m[5], 10);

    return async (network: Network, backchannelMap: BackchannelMap, testFile: string) => {
      const collator = network.paras[parachainId][0];
      let node = network.node(collator.name);
      let api: ApiPromise = await connect(node.wsUri);
      const hash = await chainDummyUpgrade(api);

      // validate in the <node>: of the relay chain
      node = network.node(nodeName);
      api = await connect(node.wsUri);
      const valid = await validateRuntimeCode(api, parachainId, hash, timeout);

      expect(valid).to.be.ok;
    };
  }


  // if we can't match let produce a fail test
  return async (network: Network) => {
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
    default:
      fn = "equal"; //default
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
  const content = fs.readFileSync(testFile).toString();
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
        ","
      )}. file: ${testFile}`
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
