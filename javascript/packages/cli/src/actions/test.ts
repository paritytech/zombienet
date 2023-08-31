import parser from "@zombienet/dsl-parser-wrapper";
import type { TestDefinition } from "@zombienet/orchestrator";
import { run } from "@zombienet/orchestrator";
import { decorators, RelativeLoader, getLogType } from "@zombienet/utils";
import fs from "fs";
import { Environment } from "nunjucks";
import path from "path";
import { AVAILABLE_PROVIDERS } from "../constants";

/**
 * Test - performs test/assertions against the spawned network, using a set of natural
 * language expressions that allow to make assertions based on metrics, logs and some
 * built-in function that query the network using polkadot.js
 * Read more here: https://paritytech.github.io/zombienet/cli/testing.html
 * @param testFile
 * @param runningNetworkSpec
 * @param opts (commander)
 * @param program (commander)
 */
export async function test(
  testFile: string,
  runningNetworkSpec: string | undefined,
  cmdOpts: any,
  program: any,
) {
  const opts = { ...program.parent.opts(), ...cmdOpts };
  const dir = opts.dir || "";

  const extension = testFile.slice(testFile.lastIndexOf(".") + 1);

  if (extension !== "zndsl") {
    console.log(
      `\n ${decorators.red(
        "Error:",
      )} File extension is not correct. Extension for tests should be '.zndsl'.\n`,
    );
  }

  process.env.DEBUG = "zombie";
  const inCI =
    process.env.RUN_IN_CONTAINER === "1" ||
    process.env.ZOMBIENET_IMAGE !== undefined;
  // use `k8s` as default
  const providerToUse =
    opts.provider && AVAILABLE_PROVIDERS.includes(opts.provider)
      ? opts.provider
      : "kubernetes";

  const configBasePath = path.dirname(testFile);
  const env = new Environment(new RelativeLoader([configBasePath]));
  const templateContent = fs.readFileSync(testFile).toString();
  const content = env.renderString(templateContent, process.env);

  const testName = getTestNameFromFileName(testFile);

  let testDef: TestDefinition;
  try {
    testDef = JSON.parse(parser.parse_to_json(content));
  } catch (e) {
    console.log(`\n ${decorators.red("Error:")} \t ${decorators.bright(e)}\n`);
    process.exit(1);
  }

  await run(
    configBasePath,
    testName,
    testDef,
    providerToUse,
    inCI,
    opts.spawnConcurrency,
    getLogType(opts.logType),
    runningNetworkSpec,
    dir,
  );
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
