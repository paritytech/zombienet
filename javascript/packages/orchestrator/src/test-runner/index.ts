import {
  decorators,
  getLokiUrl,
  readNetworkConfig,
  setLogType,
  sleep,
  LogType,
  registerTotalElapsedTimeSecs,
} from "@zombienet/utils";
import fs from "fs";
import Mocha from "mocha";
import path from "path";
import { Network, rebuildNetwork } from "../network";
import { start } from "../orchestrator";
import { Providers } from "../providers";
import { TestDefinition } from "../types";
import assertions from "./assertions";
import commands from "./commands";
import { LaunchConfig } from "../configTypes";

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
  inCI = false,
  concurrency = 1,
  logType: LogType = "table",
  runningNetworkSpecPath: string | undefined,
  dir: string | undefined,
  force: boolean = false,
) {
  const testStart = performance.now();
  logType && setLogType(logType);
  let network: Network;
  const backchannelMap: BackchannelMap = {};

  let suiteName: string = testName;
  if (testDef.description) suiteName += `( ${testDef.description} )`;

  // read network file
  const networkConfigFilePath = fs.existsSync(testDef.network)
    ? testDef.network
    : path.resolve(configBasePath, testDef.network);

  const config: LaunchConfig = readNetworkConfig(networkConfigFilePath);

  // set the provider
  if (!config.settings)
    config.settings = { provider, timeout: DEFAULT_GLOBAL_TIMEOUT };
  else config.settings.provider = provider;

  // find creds file
  const credsFile = inCI ? "config" : testDef.creds;
  let creds: string | undefined;
  if (fs.existsSync(credsFile)) creds = credsFile;
  else {
    const possiblePaths = [
      ".",
      "..",
      `${process.env.HOME}/.kube`,
      "/etc/zombie-net",
    ];
    const credsFileExistInPath: string | undefined = possiblePaths.find(
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
      if (!runningNetworkSpecPath) {
        console.log(`\t Launching network... this can take a while.`);
        network = await start(creds!, config, {
          spawnConcurrency: concurrency,
          inCI,
          logType,
          dir,
          force,
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
      console.log(
        `\n${decorators.red(
          "Error launching the network!",
        )} \t ${decorators.bright(err)}`,
      );
      exitMocha(100);
    }
  });

  suite.afterAll("teardown", async function () {
    this.timeout(180 * 1000);
    if (network && !network.wasRunning) {
      // report metric
      const testEnd = performance.now();
      const elapsedSecs = Math.round((testEnd - testStart) / 1000);
      debug(`\t 🕰 [Test] elapsed time: ${elapsedSecs} secs`);
      if(inCI) await registerTotalElapsedTimeSecs(elapsedSecs);

      const logsPath = await network.dumpLogs(false);
      const tests = this.test?.parent?.tests;

      if (tests) {
        const failed = tests.filter((test) => {
          return test.state !== "passed";
        });
        if (failed.length) {
          console.log(
            `\n\n\t${decorators.red("❌ One or more of your test failed...")}`,
          );
        }

        // All test passed, just remove the network
        console.log(`\n\t ${decorators.green("Deleting network")}`);
        await network.stop();

        // show logs
        console.log(
          `\n\n\t${decorators.magenta(
            "📓 To see the full logs of the nodes please go to:",
          )}`,
        );
        switch (network.client.providerName) {
          case "podman":
          case "native":
            console.log(`\n\t${decorators.magenta(logsPath)}`);
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

              for (const [paraId, parachain] of Object.entries(network.paras)) {
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

              // logs are also collected as artifacts
              console.log(
                `\n\n\t ${decorators.yellow(
                  "📓 Logs are also available in the artifacts' pipeline in gitlab",
                )}`,
              );
            } else {
              console.log(`\n\t${decorators.magenta(logsPath)}`);
            }
            break;
        }
      }
    }
    return;
  });

  for (const assertion of testDef.assertions) {
    const generator = fns[assertion.parsed.fn as keyof Fns];
    debug(generator);

    if (!generator) {
      console.log(
        `\n ${decorators.red("Invalid fn generator:")} \t ${decorators.bright(
          assertion.parsed.fn,
        )}`,
      );
      process.exit(1);
    }

    const testFn = generator(assertion.parsed.args);
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
