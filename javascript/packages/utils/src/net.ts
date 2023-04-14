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
  return await new Promise((resolve) => {
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
      let i = true;
      while (i) {
        const read = await reader?.read();
        if (read?.done) {
          writer.close();
          i = false;
          resolve();
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

export function isMultiAddr(addr: string) {
  const ws =
    /\/(ip4|ip6|dns4|dns6|dns)\/(.*?)\/tcp\/[0-9]{0,5}\/(ws|wss|tls\/ws)\/p2p\/[a-zA-Z1-9^Il0O]+/i;

  const webrtc =
    /\/(ip4|ip6)\/(.*?)\/udp\/(.*?)\/webrtc\/certhash\/(.*?)\/p2p\/[a-zA-Z1-9^Il0O]+/i;

  const multi = /\/(ip4|ip6)\/(.*?)\/tcp\/[0-9]{0,5}/i;

  if (!multi.test(addr) && !ws.test(addr) && !webrtc.test(addr)) return false;
  return true;
}
