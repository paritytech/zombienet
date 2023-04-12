import fs from "fs";
import { Environment } from "nunjucks";
import path from "path";
import readline from "readline";
import toml from "toml";
import yaml from "yaml";
import { decorators } from "./colors";
import { RelativeLoader } from "./nunjucksRelativeLoader";
import { LaunchConfig } from "./types";

export interface LocalJsonFileContentIF {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
  };
}

export function writeLocalJsonFile(
  path: string,
  fileName: string,
  content: LocalJsonFileContentIF,
) {
  fs.writeFileSync(`${path}/${fileName}`, JSON.stringify(content, null, 4));
}

/**
 * askQuestion: ask for user's Input
 * @param query : The string of the "question"
 * @returns
 */
export const askQuestion = async (query: string): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    }),
  );
};

export function loadTypeDef(types: string | object): object {
  if (typeof types === "string") {
    // Treat types as a json file path
    try {
      const rawdata = fs.readFileSync(types, { encoding: "utf-8" });
      return JSON.parse(rawdata);
    } catch {
      console.error(
        `${decorators.reverse(
          decorators.red(`  failed to load parachain typedef file`),
        )}`,
      );
      process.exit(1);
    }
  } else {
    return types;
  }
}

export async function makeDir(dir: string, recursive = false) {
  if (!fs.existsSync(dir)) {
    await fs.promises.mkdir(dir, { recursive });
  }
}

export function getCredsFilePath(credsFile: string): string | undefined {
  if (fs.existsSync(credsFile)) return credsFile;

  const possiblePaths = [".", "..", `${process.env.HOME}/.kube`];
  const credsFileExistInPath: string | undefined = possiblePaths.find(
    (path) => {
      const t = `${path}/${credsFile}`;
      return fs.existsSync(t);
    },
  );
  if (credsFileExistInPath) return `${credsFileExistInPath}/${credsFile}`;
}

function getReplacementInText(content: string): string[] {
  const replacements: string[] = [];
  // allow to replace with env vars, to make more dynamic usage of ci.
  // eslint-disable-next-line no-useless-escape
  const replacementRegex = /{{([A-Za-z-_\.]+)}}/gim;
  for (const match of content.matchAll(replacementRegex)) {
    replacements.push(match[1]);
  }

  return replacements;
}

const parseConfigFile = (
  content: string,
  filepath: string,
  configBasePath: string,
): LaunchConfig => {
  // eslint-disable-next-line no-useless-escape
  const jsonChar = /[\{]/;
  // eslint-disable-next-line no-useless-escape
  const tomlChar = /[\[]/;
  // eslint-disable-next-line no-useless-escape
  const yamlChar = /[A-Za-z\-\#]/;

  const fileType = filepath?.split(".")?.pop();
  if (!fileType) {
    throw new Error(
      `${decorators.bright("Error - config file has no extension.")}`,
    );
  }
  const data = fs.readFileSync(filepath, "utf-8");
  const lines = data.split(/\r?\n/);
  let firstChar;
  for (const line of lines) {
    // Avoid any lines with comments or empty lines
    if (!line || ["#", "/", " "].includes(line[0])) {
      continue;
    } else {
      firstChar = line[0];
      break;
    }
  }

  if (!firstChar) {
    throw new Error(
      `${decorators.bright("Config file has no valid characters.")}`,
    );
  }

  let config: LaunchConfig = {} as LaunchConfig;

  if (fileType?.toLocaleLowerCase() === "json" && jsonChar.test(firstChar)) {
    config = JSON.parse(content);
  } else if (
    fileType?.toLocaleLowerCase() === "toml" &&
    tomlChar.test(firstChar)
  ) {
    config = toml.parse(content);
  } else if (
    fileType?.toLocaleLowerCase() === "yaml" &&
    yamlChar.test(firstChar)
  ) {
    config = yaml.parse(content);
  } else {
    throw new Error(
      `${decorators.bright(
        "config file is not one of the known types: 'json', 'toml' or 'yaml'.",
      )}`,
    );
  }
  config.configBasePath = configBasePath;
  return config;
};

export function readNetworkConfig(filepath: string): LaunchConfig {
  const configBasePath = path.dirname(filepath);
  const env = new Environment(new RelativeLoader([configBasePath]));

  env.addFilter("zombie", function (nodeName, key) {
    return `{{ZOMBIE:${nodeName}:${key}}}`;
  });

  const temmplateContent = fs.readFileSync(filepath).toString();
  const content = env.renderString(temmplateContent, process.env);

  //  check if we have missing replacements
  const replacements = getReplacementInText(content);
  if (replacements.length > 0) {
    throw new Error(`Environment not set for : ${replacements.join(",")}`);
  }

  return parseConfigFile(content, filepath, configBasePath);
}

export function readDataFile(filepath: string): string {
  try {
    const fileData = fs.readFileSync(filepath, "utf8");
    return fileData.trim();
  } catch (err) {
    throw Error(decorators.red(`Cannot read ${filepath}: ${err}`));
  }
}
