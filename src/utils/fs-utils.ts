import toml from "toml";
import * as path from "../../_deps/path.ts";
import { LaunchConfig } from "../types.d.ts";
import { RelativeLoader } from "./nunjucks-relative-loader.ts";
import { Environment } from "nunjucks";
import * as fs from "../../_deps/fs.ts";
import { getEnvSafe } from "./getEnvSafe.ts"

export function writeLocalJsonFile(
  path: string,
  fileName: string,
  content: any
) {
  Deno.writeTextFileSync(`${path}/${fileName}`, JSON.stringify(content, null, 4));
}

export function loadTypeDef(types: string | object): object {
  if (typeof types === "string") {
    // Treat types as a json file path
    try {
      const rawdata = Deno.readTextFileSync(types);
      return JSON.parse(rawdata);
    } catch {
      console.error("failed to load parachain typedef file");
      Deno.exit(1);
    }
  } else {
    return types;
  }
}

export function getCredsFilePath(credsFile: string): string | undefined {
  if (fs.existsSync(credsFile)) return credsFile;

  const possiblePaths = [".", "..", `${getEnvSafe("HOME")}/.kube`];
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

  env.addFilter('zombie', function(nodeName){
    return `{{ZOMBIE:${nodeName}}}`;
  });

  const templateContent = Deno.readTextFileSync(filepath).toString();
  const content = env.renderString(templateContent, process.env);

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
    const fileData = Deno.readTextFileSync(filepath);
    return fileData.trim();
  } catch (err) {
    throw Error(`Cannot read ${filepath}: ` + err);
  }
}
