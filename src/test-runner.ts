const chai = require("chai");
import Mocha from "mocha";
import fs from "fs";
import { LaunchConfig } from "./types";
import { readNetworkConfig } from "./utils";
import { Network } from "./network";
const zombie = require("../");

const { expect, assert } = chai;
const { Test, Suite, before, after } = Mocha;
const mocha = new Mocha();

interface TestDefinition {
  networkConfig: string;
  creds: string;
  description?: string;
  assertions: string[];
}

export async function run(testFile: string) {
  let network: Network;
  // read test file
  const testDef = parseTestFile(testFile);
  const testName = getTestNameFromFileName(testFile);
  let suiteName: string = testName;
  if (testDef.description) suiteName += `( testDef.description )`;

  // read network file
  const config = readNetworkConfig(testDef.networkConfig);

  // find creds file
  let creds: string | undefined;
  if (fs.existsSync(testDef.creds)) creds = testDef.creds;
  else {
    const possiblePaths = [".", "..", `${process.env.HOME}/.kube`];
    let credsFileExistInPath: string | undefined = possiblePaths.find(
      (path) => {
        const t = `${path}/${testDef.creds}`;
        return fs.existsSync(t);
      }
    );
    if (credsFileExistInPath)
      creds = credsFileExistInPath + "/" + testDef.creds;
  }

  if (!creds) throw new Error(`Invalid credential file path: ${testDef.creds}`);

  // create suite
  const suite = Suite.create(mocha.suite, suiteName);

  suite.beforeAll("launching", async function () {
    console.log(`\t Launching network... this can take a while.`);
    this.timeout(300 * 1000);
    network = await zombie.start(creds, config);
    return;
  });

  suite.afterAll("teardown", async function () {
    console.log(`\t Deleting network`);
    this.timeout(120 * 1000);
    if (network) await network.stop();
    return;
  });

  for (const assertion of testDef.assertions) {
    const testFn = parseAssertionLine(assertion);
    if (!testFn) continue;
    const test = new Test(assertion, async () => await testFn(network));
    suite.addTest(test);
    test.timeout(0);
  }

  // run
  mocha.run(exitMocha);
}

// extracted from mocha test runner helper.
const exitMocha = (code: number) => {
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
  const isUpRegex = new RegExp(/^([\w]+): is up$/i);
  const isReportsWithin = new RegExp(
    /^([\w]+) reports (.*?) is (equal to|equals|=|==|greater than|>|at least|>=|lower than|<)? *(\d+)$/i
  );
  const isReports = new RegExp(
    /^([\w]+): reports (.*?) is (equal to|equals|=|==|greater than|>|at least|>=|lower than|<)? *(\d+)$/i
  );

  let m = isUpRegex.exec(assertion);
  if (m && m[1] !== null) {
    const nodeName = m[1];
    return async (network: Network) => {
      const isUp = await network.node(nodeName).isUp();
      expect(isUp).to.be.ok;
    };
  }

  m = isReports.exec(assertion);
  if (m && m[1] && m[2] && m[4]) {
    const nodeName = m[1];
    const metricName = m[2];
    const comparatorFn = getComparatorFn(m[3] || "");
    const targetValue = parseInt(m[4]);
    return async (network: Network) => {
      const value = await network.node(nodeName).getMetric(metricName);
      assert[comparatorFn](value, targetValue);
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
  const parts = testFile.split("-");
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
    const parts = line.split(":");
    if (parts.length !== 2) continue; // bad line
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
