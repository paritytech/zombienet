import { Network, start } from "@zombienet/orchestrator";
import { LaunchConfig } from "@zombienet/orchestrator/dist/types";
import {
  decorators,
  getCredsFilePath,
  readNetworkConfig,
} from "@zombienet/utils";
import fs from "fs";
import { resolve } from "path";
import {
  AVAILABLE_PROVIDERS,
  DEFAULT_GLOBAL_TIMEOUT,
  DEFAULT_PROVIDER,
} from "../constants";

/**
 * Spawn - spawns ephemeral networks, providing a simple but poweful cli that allow you to declare
 * the desired network in toml or json format.
 * Read more here: https://paritytech.github.io/zombienet/cli/spawn.html
 * @param configFile: config file, supported both json and toml formats
 * @param credsFile: Credentials file name or path> to use (Only> with kubernetes provider), we look
 *  in the current directory or in $HOME/.kube/ if a filename is passed.
 * @param _opts
 *
 * @returns Network
 */

export async function spawn(
  configFile: string,
  credsFile: string | undefined,
  cmdOpts: any,
  program: any,
): Promise<Network> {
  const opts = { ...program.parent.opts(), ...cmdOpts };
  const dir = opts.dir || "";
  const force = opts.force || false;
  const monitor = opts.monitor || false;
  // By default spawn pods/process in batches of 4,
  // since this shouldn't be a bottleneck in most of the cases,
  // but also can be set with the `-c` flag.
  const spawnConcurrency = opts.spawnConcurrency || 4;
  const configPath = resolve(process.cwd(), configFile);
  if (!fs.existsSync(configPath)) {
    console.error(
      `${decorators.reverse(
        decorators.red(`  ⚠ Config file does not exist: ${configPath}`),
      )}`,
    );
    process.exit();
  }

  const filePath = resolve(configFile);
  const config: LaunchConfig = readNetworkConfig(filePath);

  // set default provider and timeout if not provided
  if (!config.settings) {
    config.settings = {
      provider: DEFAULT_PROVIDER,
      timeout: DEFAULT_GLOBAL_TIMEOUT,
    };
  } else {
    if (!config.settings.provider) config.settings.provider = DEFAULT_PROVIDER;
    if (!config.settings.timeout)
      config.settings.timeout = DEFAULT_GLOBAL_TIMEOUT;
  }

  // if a provider is passed, let just use it.
  if (opts.provider && AVAILABLE_PROVIDERS.includes(opts.provider)) {
    config.settings.provider = opts.provider;
  }

  let creds = "";
  if (config.settings?.provider === "kubernetes") {
    creds = getCredsFilePath(credsFile || "config") || "";
    if (!creds) {
      console.log(
        `Running ${config.settings?.provider || DEFAULT_PROVIDER} provider:`,
      );
      console.error(
        `${decorators.reverse(
          decorators.red(`  ⚠ I can't find the Creds file: ${credsFile}`),
        )}`,
      );
      process.exit();
    }
  }

  const inCI = process.env.RUN_IN_CONTAINER === "1";
  const options = {
    monitor,
    spawnConcurrency,
    dir,
    force,
    inCI,
    silent: false,
  };
  const network = await start(creds, config, options);
  network.showNetworkInfo(config.settings?.provider);
  return network;
}
