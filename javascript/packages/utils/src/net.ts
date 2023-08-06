import dns from "dns";
import fs from "fs";
import { AddressInfo, createServer } from "net";
import os from "os";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { ReadableStream } from "stream/web";
import { decorators } from "./colors";

const usedPorts = new Map<number, number>();

export interface GetRandomPortOptions {
  maxRetries?: number;
  timeout?: number;
}

/**
 * Get a random available TCP port.
 *
 * Note that this function is prone to race conditions: a different process can start using the
 * returned port before the caller of this function can start their server. However, in-process
 * race conditions are prevented by storing the returned ports, so that a quick succession of
 * calls to this function never returns a duplicate port.
 */
export async function getRandomPort(
  options?: GetRandomPortOptions,
): Promise<number> {
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

  let retries = 0;
  const maxRetries = options?.maxRetries || 10;
  const timeout = options?.timeout || 10 * 60 * 1000; // 10 minutes
  while (retries < maxRetries) {
    retries++;
    const port: number = (await inner()) as number;
    const portUsedTimestamp = usedPorts.get(port);
    const now = Date.now();
    if (portUsedTimestamp === undefined || portUsedTimestamp < now) {
      usedPorts.set(port, now + timeout);
      return port;
    } else {
      // Warning: port already used previously
      console.error(`Warning: port ${port} already used, retrying`);
    }
  }

  throw new Error(
    `Couldn't find an available TCP port after ${maxRetries} tries`,
  );
}

export async function getHostIp(): Promise<string> {
  return await new Promise((resolve) => {
    dns.lookup(os.hostname(), (_err: unknown, addr: string) => {
      resolve(addr);
    });
  });
}

export async function downloadFile(url: string, dest: string): Promise<void> {
  try {
    const { body } = await fetch(url);
    const writable = fs.createWriteStream(dest);
    const readable = Readable.fromWeb(body as ReadableStream);
    await finished(readable.pipe(writable));
  } catch (err) {
    console.log(
      `\n ${decorators.red("Unexpected error: ")} \t ${decorators.bright(
        err,
      )}\n`,
    );
  }
}
