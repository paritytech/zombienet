const chai = require("chai");
import {
  decorators,
  getLokiUrl,
  readNetworkConfig,
  sleep,
} from "@zombienet/utils";
import fs from "fs";
import Mocha from "mocha";
import path from "path";
import { Network, rebuildNetwork } from "../network";
import { start } from "../orchestrator";
import { Providers } from "../providers";
import { LaunchConfig, TestDefinition } from "../types";
import assertions from "./assertions";
import commands from "./commands";

const DEFAULT_GLOBAL_TIMEOUT = 1200; // 20 mins

const debug = require("debug")("zombie::test-runner");

const { Test, Suite } = Mocha;
const mocha = new Mocha();

export interface BackchannelMap {
  [propertyName: string]: any;
}

export async function run(
  configBasePath: string,
  testName: string,
  testDef: TestDefinition,
  provider: string,
  inCI: boolean = false,
  concurrency: number = 1,
  runningNetworkSpecPath: string | undefined,
) {
  let network: Network;
  let backchannelMap: BackchannelMap = {};

  let suiteName: string = testName;
  if (testDef.description) suiteName += `( ${testDef.description} )`;

  // read network file
  let networkConfigFilePath = fs.existsSync(testDef.network)
    ? testDef.network
    : path.resolve(configBasePath, testDef.network);
  const config: LaunchConfig = readNetworkConfig(networkConfigFilePath);

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
        network = await start(creds!, config, {
          spawnConcurrency: concurrency,
          inCI,
        });
      } else {
        const runningNetworkSpec: any = require(runningNetworkSpecPath);
        if (provider !== runningNetworkSpec.client.providerName)
          throw new Error(
            `Invalid provider, the provider set doesn't match with the running network definition`,
          );

        const { client, namespace, tmpDir } = runningNetworkSpec;
        // initialize the Client
        const initClient = Providers.get(
          runningNetworkSpec.client.providerName,
        ).initClient(client.configPath, namespace, tmpDir);
        // initialize the network
        network = rebuildNetwork(initClient, runningNetworkSpec);
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
                  for (const node of parachain?.nodes) {
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
    let generator = fns[assertion.parsed.fn as keyof Fns];
    debug(generator);

    if (!generator) {
      console.log(
        `\n\t ${decorators.red("Invalid fn generator:" + assertion.parsed.fn)}`,
      );
      process.exit(1);
    }

    let testFn = generator(assertion.parsed.args);
    const test = new Test(
      assertion.original_line,
      async () => await testFn(network, backchannelMap, configBasePath),
    );
    suite.addTest(test);
    test.timeout(0);
  }

  // pass the file path, don't load the reporter as a module
  const resolvedReporterPath = path.resolve(__dirname, "./testReporter");
  mocha.reporter(resolvedReporterPath);

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

// Generators registry
type Fns = { [key: string]: Function };
const fns: Fns = {
  ...assertions,
  ...commands,
};
