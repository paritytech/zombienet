import { randomBytes } from "crypto";
import fs from "fs";


export async function sleep(ms:number) {
    return new Promise(resolve => setTimeout(resolve, ms));
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