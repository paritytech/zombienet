import { randomBytes } from "crypto";
import { format } from "util";
import { createHash } from "crypto";

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
