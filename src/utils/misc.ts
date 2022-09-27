import { randomBytes } from "crypto";
import { format } from "util";
import { createHash } from "crypto";
import { LOKI_URL_FOR_NODE } from "../constants";

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateNamespace(n: number = 16): string {
  const buf = randomBytes(n);
  return buf.toString("hex");
}

export function getSha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function addMinutes(howMany: number, baseDate?: Date): [number, number] {
  const baseTs = baseDate ? baseDate.getTime() : new Date().getTime();

  let targetTs = baseTs + howMany * 60 * 1000;
  const targetDate = new Date(targetTs);
  return [targetDate.getUTCHours(), targetDate.getUTCMinutes()];
}

// Helper function to convert bytes to MB
export const convertBytes = (bytes: number) =>
  (
    bytes / Math.pow(1024, Math.floor(Math.log(bytes) / Math.log(1024)))
  ).toFixed(0);

export function isValidHttpUrl(input: string) {
  let url;

  try {
    url = new URL(input);
  } catch (_) {
    return false;
  }

  return url.protocol === "http:" || url.protocol === "https:";
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

// convert 1e+X (e.g 1e+21) to literal
export function convertExponentials(data: string): string {
  const converted = data.replace(/e\+[0-9]+/gi, function (exp) {
    const e = parseInt(exp.split("+")[1], 10);
    return "0".repeat(e);
  });
  return converted;
}

export function getLokiUrl(
  namespace: string,
  podName: string,
  from: number | string,
  to?: number | string,
): string {
  const loki_url = LOKI_URL_FOR_NODE.replace(/{{namespace}}/, namespace)
    .replace(/{{podName}}/, podName)
    .replace(/{{from}}/, from.toString())
    .replace(/{{to}}/, to?.toString() || "now");

  return loki_url;
}


export function getRandom(arr: string[], n: number) {
  let result = new Array(n),
    len = arr.length,
    taken = new Array(len);
  while (n--) {
    let x = Math.floor(Math.random() * len);
    result[n] = arr[x in taken ? taken[x] : x];
    taken[x] = --len in taken ? taken[len] : len;
  }
  return result;
}

export function getFilePathNameExt(filePath: string): {
  fullPath: string;
  fileName: string;
  extension: string;
} {
  // Get path, fileName and extension
  const index = filePath.lastIndexOf("/");
  const fullPath = filePath.slice(0, index);
  const fileNameWithExt = filePath.slice(index + 1);
  const extension = fileNameWithExt.split(".").pop() || "";
  const [fileName] = fileNameWithExt.split(".");

  return { fullPath, fileName, extension };
}

