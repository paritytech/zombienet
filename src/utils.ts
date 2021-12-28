import { randomBytes } from "crypto";
import fs from "fs";
import { format } from "util";
import { LaunchConfig, Node } from "./types";
import toml from "toml";
import { getUniqueName, WAIT_UNTIL_SCRIPT_SUFIX } from "./configManager";
import path from "path";
import { createHash } from "crypto";
import { AddressInfo, createServer } from "net";
const dns = require("dns")
const os = require("os");

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateNamespace(n:number=16): string {
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

export function addMinutes(howMany: number, baseDate?: Date): number {
  const baseHours = baseDate
    ? baseDate.getUTCMinutes()
    : new Date().getUTCMinutes();
  return (baseHours + 59 + howMany) % 59;
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
  let content = fs.readFileSync(filepath).toString();
  let replacements = getReplacementInText(content);

  for (const replacement of replacements) {
    const replacementValue = process.env[replacement];
    if (replacementValue === undefined)
      throw new Error(`Environment not set for : ${replacement}`);
    content = content.replace(
      new RegExp(`{{${replacement}}}`, "gi"),
      replacementValue
    );
  }

  // TODO: add better file recognition
  const fileType = filepath.split(".").pop();
  const config: LaunchConfig =
    fileType?.toLocaleLowerCase() === "json"
      ? JSON.parse(content) //require(filepath)
      : toml.parse(content);


  config.configBasePath = configBasePath;
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

export function createTempNodeDef(name: string, image: string, chain: string, fullCommand: string) {
  let node: Node = {
    name: getUniqueName("temp"),
    image,
    fullCommand: fullCommand + " && " + WAIT_UNTIL_SCRIPT_SUFIX, // leave the pod runnig until we finish transfer files
    chain,
    validator: false,
    bootnodes: [],
    args: [],
    env: [],
    telemetryUrl: "",
    overrides: [],
  };

  return node;
}

export function getSha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function getRandomPort(): Promise<number> {
	const inner =  async () => {
    return new Promise((resolve, reject) => {
		  const server = createServer();
		  server.unref();
		  server.on('error', reject);

		  server.listen(0, () => {
	  		const {port} = server.address() as AddressInfo;
		  	server.close(() => {
			  	resolve(port);
			  });
		  });
	  });
  }

  const port: number = await inner() as number;
  return port;
}

export async function getHostIp(): Promise<string> {
  return await new Promise((resolve, reject) => {
    dns.lookup(os.hostname(), (err: any, addr:any) => {
      resolve(addr);
    })
  });
}