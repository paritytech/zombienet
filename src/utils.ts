import { randomBytes } from "crypto";
import fs from "fs";
import { format } from "util";
import { LaunchConfig } from "./types";
import toml from "toml";

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateNamespace(): string {
  const buf = randomBytes(16);
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
  // TODO: add better file recognition
  const fileType = filepath.split(".").pop();
  const config: LaunchConfig =
    fileType?.toLocaleLowerCase() === "json"
      ? require(filepath)
      : toml.parse(fs.readFileSync(filepath).toString());

  return config;
}
