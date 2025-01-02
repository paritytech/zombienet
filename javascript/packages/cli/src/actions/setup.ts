import { askQuestion, convertBytes, decorators } from "@zombienet/utils";
import cliProgress from "cli-progress";
import fs from "fs";
import path from "path";

interface OptIf {
  [key: string]: { name: string; url?: string; size?: string };
}

const POLKADOT_SDK = "polkadot-sdk";
const POLKADOT = "polkadot";
const POLKADOT_PREPARE_WORKER = "polkadot-prepare-worker";
const POLKADOT_EXECUTE_WORKER = "polkadot-execute-worker";
const POLKADOT_PARACHAIN = "polkadot-parachain";

const POSSIBLE_BINARIES = [POLKADOT, POLKADOT_PARACHAIN];
const POLKADOT_WORKERS = [POLKADOT_PREPARE_WORKER, POLKADOT_EXECUTE_WORKER];

const options: OptIf = {};
/**
 * Setup - easily download latest artifacts and make them executable in order to use them with zombienet
 * Read more here: https://paritytech.github.io/zombienet/cli/setup.html
 * @param params binaries that willbe downloaded and set up. Possible values: `polkadot` `polkadot-parachain`
 * @param opts Options from cli, currently only support `yes` to bypass the confirmation to download the binaries
 * @returns
 */
export async function setup(params: any, opts?: any) {
  // If the platform is MacOS (intel) then the repos needs to be cloned and run locally by the user
  // as polkadot and/or polkadot-parachain do not release a valid binaries for MacOS
  if (process.platform === "darwin" && process.arch !== "arm64") {
    console.log(
      `${decorators.red(
        "\n\n------------------------------------------------------------------------\n\nNote: ",
      )} You are using MacOS (intel). Please, clone Polkadot SDK from ` +
        decorators.cyan("https://github.com/paritytech/polkadot-sdk") +
        ` \n in order to build the polkadot and/or polkadot-parachain locally.\n At the moment there is no binaries for MacOs as releases.` +
        decorators.red(
          `\n\n------------------------------------------------------------------------`,
        ),
    );
    return;
  }

  console.log(decorators.green("\n\n🧟🧟🧟 ZombieNet Setup 🧟🧟🧟\n\n"));
  if (!isValidHost()) {
    console.log(
      "Zombienet setup currently supports only linux(x64) and MacOS (arm64). \n Alternative, you can use k8s or podman. For more read here: https://github.com/paritytech/zombienet#requirements-by-provider",
    );
    return;
  }

  console.log(decorators.green("Gathering latest releases' versions...\n"));
  const arch_sufix = process.arch === "arm64" ? "aarch64-apple-darwin" : "";

  await new Promise<void>((resolve) => {
    latestPolkadotReleaseURL(POLKADOT_SDK, `${POLKADOT}-${arch_sufix}`).then(
      (res: [string, string]) => {
        options[POLKADOT] = {
          name: POLKADOT,
          url: res[0],
          size: res[1],
        };
        resolve();
      },
    );
  });

  await new Promise<void>((resolve) => {
    latestPolkadotReleaseURL(
      POLKADOT_SDK,
      `${POLKADOT_PREPARE_WORKER}-${arch_sufix}`,
    ).then((res: [string, string]) => {
      options[POLKADOT_PREPARE_WORKER] = {
        name: POLKADOT_PREPARE_WORKER,
        url: res[0],
        size: res[1],
      };
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    latestPolkadotReleaseURL(
      POLKADOT_SDK,
      `${POLKADOT_EXECUTE_WORKER}-${arch_sufix}`,
    ).then((res: [string, string]) => {
      options[POLKADOT_EXECUTE_WORKER] = {
        name: POLKADOT_EXECUTE_WORKER,
        url: res[0],
        size: res[1],
      };
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    latestPolkadotReleaseURL(
      POLKADOT_SDK,
      `${POLKADOT_PARACHAIN}-${arch_sufix}`,
    ).then((res: [string, string]) => {
      options[POLKADOT_PARACHAIN] = {
        name: POLKADOT_PARACHAIN,
        url: res[0],
        size: res[1],
      };
      resolve();
    });
  });

  if (params[0] === "all") {
    params = [POLKADOT, POLKADOT_PARACHAIN];
  }

  if (params.length === 0) {
    console.log(decorators.green("No binaries to download. Exiting..."));
    return;
  }
  let count = 0;

  console.log("Setup will start to download binaries:");

  params.forEach((a: any) => {
    if (!POSSIBLE_BINARIES.includes(a)) {
      params = params.filter((param: any) => param !== a);
      console.log(
        decorators.red(
          `"${a}" is not one of the possible options for this setup and will be skipped;`,
        ),
        decorators.green(
          ` Valid options: 'polkadot', 'polkadot-parachain', 'all'`,
        ),
      );
      return;
    }
    let size = 0;
    if (a === POLKADOT) {
      size = parseInt(options[a]?.size || "0", 10);
      count += size;
      console.log("-", a, "\t\t\t Approx. size ", size, " MB");

      POLKADOT_WORKERS.forEach((b) => {
        params.push(b);
        size = parseInt(options[b]?.size || "0", 10);
        count += size;
        console.log("-", b, "\t Approx. size ", size, " MB");
      });
    } else {
      size = parseInt(options[a]?.size || "0", 10);
      count += size;
      console.log("-", a, "\t\t Approx. size ", size, " MB");
    }
  });
  console.log("Total approx. size:\t\t\t ", count, "MB");
  if (!opts?.yes) {
    const response = await askQuestion(
      decorators.yellow("\nDo you want to continue? (y/n)"),
    );
    if (response.toLowerCase() !== "n" && response.toLowerCase() !== "y") {
      console.log("Invalid input. Exiting...");
      return;
    }
    if (response.toLowerCase() === "n") {
      return;
    }
  }
  downloadBinaries(params);
  return;
}

// helper fns

// Check if the host is a valid platform/arch
const isValidHost = (): boolean => {
  const isValid =
    process.platform === "linux" && process.arch === "x64"
      ? true
      : process.platform === "darwin" && process.arch === "arm64"
        ? true
        : false;

  return isValid;
};
// Download the binaries
const downloadBinaries = async (binaries: string[]): Promise<void> => {
  try {
    console.log(decorators.yellow("\nStart download...\n"));
    const promises = [];

    const multibar = new cliProgress.MultiBar(
      {
        clearOnComplete: false,
        hideCursor: true,
        format:
          decorators.yellow("{bar} - {percentage}%") +
          " | " +
          decorators.cyan("Binary name:") +
          " {filename}",
      },
      cliProgress.Presets.shades_grey,
    );

    for (const binary of binaries) {
      console.log(options);
      promises.push(
        new Promise<void>(async (resolve) => {
          const result = options[binary];
          if (!result) {
            console.log("options", options, "binary", binary);
            throw new Error("Binary is not defined");
          }
          const { url, name } = result;
          const filepath = path.resolve(name);

          if (!url) throw new Error("No url for downloading, was provided");

          const response = await fetch(url);

          if (!response.ok)
            throw Error(response.status + " " + response.statusText);

          const contentLength = response.headers.get(
            "content-length",
          ) as string;
          let loaded = 0;

          const progressBar = multibar.create(parseInt(contentLength, 10), 0);
          const reader = response.body?.getReader();
          const writer = fs.createWriteStream(filepath);

          let i = true;
          while (i) {
            const read = await reader?.read();
            if (read?.done) {
              writer.close();
              i = false;
              resolve();
            }
            if (read?.value) {
              loaded += read.value.length;
              progressBar.increment();
              progressBar.update(loaded, {
                filename: name,
              });
              writer.write(read.value);
            }
          }
          // make the file exec
          await fs.promises.chmod(filepath, 755);
        }),
      );
    }

    await Promise.all(promises);
    multibar.stop();
    console.log(
      decorators.cyan(
        `\n\nPlease add the current dir to your $PATH by running the command:\n`,
      ),
      decorators.blue(`export PATH=${process.cwd()}:$PATH\n\n`),
    );
  } catch (err) {
    console.log(
      `\n ${decorators.red("Unexpected error: ")} \t ${decorators.bright(
        err,
      )}\n`,
    );
  }
};

// Retrieve the latest release for polkadot
const latestPolkadotReleaseURL = async (
  repo: string,
  name: string,
): Promise<[string, string]> => {
  try {
    const releases = await fetch(
      `https://api.github.com/repos/paritytech/${repo}/releases`,
    );

    let obj: any;

    const allReleases = await releases.json();
    const release = allReleases.find((r: any) => {
      obj = r?.assets?.find((a: any) => a.name === name);
      return Boolean(obj);
    });

    if (!release) {
      throw Error(
        `In repo '${repo}', there is no release for: '${name}'! Exiting...`,
      );
    }

    const { tag_name } = release;

    if (!tag_name) {
      throw new Error(
        "Should never come to this point. Tag_name should never be undefined!",
      );
    }

    return [obj.browser_download_url, convertBytes(obj.size)];
  } catch (err: any) {
    if (err.code === "ENOTFOUND") {
      throw new Error("Network error.");
    } else if (err.response && err.response.status === 404) {
      throw new Error(
        "Could not find a release. Error 404 (not found) detected",
      );
    }
    throw new Error(
      `Error status: ${err?.response?.status}. Error message: ${err?.response}`,
    );
  }
};
