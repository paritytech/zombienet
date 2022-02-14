import { randomBytes } from "crypto";
import fs from "fs";
import { format } from "util";
import toml from "toml";
import path from "path";
import { createHash } from "crypto";
import { AddressInfo, createServer } from "net";
import { Environment } from "nunjucks";
const dns = require("dns");
const os = require("os");
import { LaunchConfig, Node } from "./types";
import { RelativeLoader } from "./nunjucks-relative-loader";
import { debug } from "console";

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateNamespace(n: number = 16): string {
  const buf = randomBytes(n);
  return buf.toString("hex");
}

export function readDataFile(filepath: string): string {
  try {
    const fileData = fs.readFileSync(filepath, "utf8");
    return fileData.trim();
  } catch (err) {
    throw Error(`Cannot read ${filepath}: ` + err);
  }
}

export function addMinutes(howMany: number, baseDate?: Date): [number,number] {
  const baseTs = baseDate
    ? baseDate.getTime()
    : new Date().getTime();

  let targetTs = baseTs + howMany * 60 * 1000;
  const targetDate = new Date(targetTs);
  return [targetDate.getUTCHours(), targetDate.getUTCMinutes()];
}

export function filterConsole(excludePatterns: string[], options?: any) {
  options = {
    console,
    methods: ["log", "debug", "info", "warn", "error"],
    ...options,
  };

  const { console: consoleObject, methods } = options;
  const originalMethods = methods.map((method: any) => consoleObject[method]);

  const check = (output: string) => {
    for (const pattern of excludePatterns) {
      if (output.includes(pattern)) return true;
    }

    return false;
  };

  for (const method of methods) {
    const originalMethod = consoleObject[method];

    consoleObject[method] = (...args: any) => {
      if (check(format(...args))) {
        return;
      }

      originalMethod(...args);
    };
  }

  return () => {
    for (const [index, method] of methods.entries()) {
      consoleObject[method] = originalMethods[index];
    }
  };
}

export function readNetworkConfig(filepath: string): LaunchConfig {
  const configBasePath = path.dirname(filepath);
  const env = new Environment(new RelativeLoader([configBasePath]));
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
  debug(config);
  return config;
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

export function writeLocalJsonFile(
  path: string,
  fileName: string,
  content: any
) {
  fs.writeFileSync(`${path}/${fileName}`, JSON.stringify(content, null, 4));
}

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

export function getSha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function getRandomPort(): Promise<number> {
  const inner = async () => {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.unref();
      server.on("error", reject);

      server.listen(0, () => {
        const { port } = server.address() as AddressInfo;
        server.close(() => {
          resolve(port);
        });
      });
    });
  };

  const port: number = (await inner()) as number;
  return port;
}

export async function getHostIp(): Promise<string> {
  return await new Promise((resolve, reject) => {
    dns.lookup(os.hostname(), (err: any, addr: any) => {
      resolve(addr);
    });
  });
}

export async function series(
  functionsThatGeneratePromisesThatRunInSeries: any[],
  concurrency = 1
) {
  let results: any = null;

  functionsThatGeneratePromisesThatRunInSeries = functionsThatGeneratePromisesThatRunInSeries.slice();

  return new Promise((resolve, reject) => {
    const next = (result?: any) => {
      const concurrentPromises = [];
      results = !results ? [] : [...results, ...result];

      if (functionsThatGeneratePromisesThatRunInSeries.length) {
        while (
          concurrentPromises.length < concurrency &&
          functionsThatGeneratePromisesThatRunInSeries.length
        ) {
          let promise = functionsThatGeneratePromisesThatRunInSeries.shift();
          if (typeof promise === "function") {
            promise = promise();
          } else {
            return reject(new Error("Invalid argument")); // see comment above. we need functions
          }

          if (!promise || typeof promise.then !== "function") {
            promise = Promise.resolve(promise); // create a promise and resolve with the `promise` value.
          }

          concurrentPromises.push(promise);
        }

        Promise.all(concurrentPromises).then(next).catch(reject);
      } else {
        return resolve(results);
      }
    };

    next();
  });
}
