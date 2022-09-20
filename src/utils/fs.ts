import fs from "fs";
import toml from "toml";
import path from "path";
import readline from "readline";
import { LaunchConfig } from "../types";
import { RelativeLoader } from "./nunjucks-relative-loader";
import { Environment } from "nunjucks";

export function writeLocalJsonFile(
  path: string,
  fileName: string,
  content: any,
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
      console.error("failed to load parachain typedef file");
      process.exit(1);
    }
  } else {
    return types;
  }
}

export function getCredsFilePath(credsFile: string): string | undefined {
  if (fs.existsSync(credsFile)) return credsFile;

  const possiblePaths = [".", "..", `${process.env.HOME}/.kube`];
  let credsFileExistInPath: string | undefined = possiblePaths.find((path) => {
    const t = `${path}/${credsFile}`;
    return fs.existsSync(t);
  });
  if (credsFileExistInPath) return `${credsFileExistInPath}/${credsFile}`;
}

function getReplacementInText(content: string): string[] {
  const replacements: string[] = [];
  // allow to replace with env vars, to make more dynamic usage of ci.
  const replacementRegex = /{{([A-Za-z-_\.]+)}}/gim;
  for (const match of content.matchAll(replacementRegex)) {
    replacements.push(match[1]);
  }

  return replacements;
}

export function readNetworkConfig(filepath: string): LaunchConfig {
  const configBasePath = path.dirname(filepath);
  const env = new Environment(new RelativeLoader([configBasePath]));

  env.addFilter("zombie", function (nodeName, key) {
    return `{{ZOMBIE:${nodeName}:${key}}}`;
  });

  const temmplateContent = fs.readFileSync(filepath).toString();
  const content = env.renderString(temmplateContent, process.env);

  //  check if we have missing replacements
  let replacements = getReplacementInText(content);
  if (replacements.length > 0) {
    throw new Error(`Environment not set for : ${replacements.join(",")}`);
  }

  // TODO: add better file recognition
  const fileType = filepath.split(".").pop();
  const config: LaunchConfig =
    fileType?.toLocaleLowerCase() === "json"
      ? JSON.parse(content)
      : toml.parse(content);

  config.configBasePath = configBasePath;
  return config;
}

export function readDataFile(filepath: string): string {
  try {
    const fileData = fs.readFileSync(filepath, "utf8");
    return fileData.trim();
  } catch (err) {
    throw Error(`Cannot read ${filepath}: ` + err);
  }
}
