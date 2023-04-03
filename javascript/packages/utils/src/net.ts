import dns from "dns";
import fs from "fs";
import { AddressInfo, createServer } from "net";
import os from "os";
import { decorators } from "./colors";

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
    dns.lookup(os.hostname(), (_err: unknown, addr: string) => {
      resolve(addr);
    });
  });
}

export async function downloadFile(url: string, dest: string): Promise<void> {
  try {
    await new Promise<void>(async (resolve) => {
      const response = await fetch(url);
      const reader = response.body?.getReader();
      const writer = fs.createWriteStream(dest);
      while (true) {
        const read = await reader?.read();
        if (read?.done) {
          writer.close();
          resolve();
          break;
        }
        writer.write(read?.value);
      }
    });
  } catch (err) {
    console.log(
      `\n ${decorators.red("Unexpected error: ")} \t ${decorators.bright(
        err,
      )}\n`,
    );
  }
}
