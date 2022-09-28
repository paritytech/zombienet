import dns from "dns";
import { AddressInfo, createServer } from "net";
import os from "os";

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
