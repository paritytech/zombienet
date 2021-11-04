import { spawn } from "child_process";
import { KubeClient } from "./providers/k8s";
const debug = require('debug')('zombie::port-forwarder');

export async function startPortForwarding(
  port: number,
  identifier: string,
  client: KubeClient
): Promise<number> {
  return new Promise((resolve, reject) => {
    const mapping = `:${port}`;
    const args = [
      "port-forward",
      identifier,
      mapping,
      "--namespace",
      client.namespace,
      "--kubeconfig",
      client.configPath,
    ];

    const subprocess = spawn("kubectl", args);

    let resolved = false;
    subprocess.stdout.on("data", function (data) {
      if (resolved) return;
      const stdout = data.toString();
      const m = /.\d{1,3}:(\d+)/.exec(stdout);
      debug("stdout: " + stdout);
      if (m && !resolved) {
        resolved = true;
        resolve(parseInt(m[1]));
      }

      reject(new Error(`ERR: port-fw for ${identifier}`));
    });

    subprocess.stderr.on('data', function (data) {
        const s = data.toString();
        if(resolved && s.includes('error')) {
          reject(new Error(`ERR: port-fw for ${identifier} : ${s}`));
          debug('stderr: ' + s);
        }
    });

    subprocess.on("exit", function () {
      console.log("child process exited");
      reject(new Error(`ERR: port-fw for ${identifier}`));
    });
  });
}
