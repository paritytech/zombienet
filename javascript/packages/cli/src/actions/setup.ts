import { askQuestion, convertBytes, decorators } from "@zombienet/utils";
import cliProgress from "cli-progress";
import fs from "fs";
import path from "path";

interface OptIf {
  [key: string]: { name: string; url?: string; size?: string };
}

const options: OptIf = {};
/**
 * Setup - easily download latest artifacts and make them executablein order to use them with zombienet
 * Read more here: https://paritytech.github.io/zombienet/cli/setup.html
 * @param params binaries that willbe downloaded and set up. Possible values: `polkadot` `polkadot-parachain`
 * @returns
 */
export async function setup(params: any) {
  const POSSIBLE_BINARIES = ["polkadot", "polkadot-parachain"];

  console.log(decorators.green("\n\n🧟🧟🧟 ZombieNet Setup 🧟🧟🧟\n\n"));
  if (
    ["aix", "freebsd", "openbsd", "sunos", "win32"].includes(process.platform)
  ) {
    console.log(
      "Zombienet currently supports linux and MacOS. \n Alternative, you can use k8s or podman. For more read here: https://github.com/paritytech/zombienet#requirements-by-provider",
    );
    return;
  }

  console.log(decorators.green("Gathering latest releases' versions...\n"));
  await new Promise<void>((resolve) => {
    latestPolkadotReleaseURL("polkadot", "polkadot").then(
      (res: [string, string]) => {
        options.polkadot = {
          name: "polkadot",
          url: res[0],
          size: res[1],
        };
        resolve();
      },
    );
  });

  await new Promise<void>((resolve) => {
    latestPolkadotReleaseURL("cumulus", "polkadot-parachain").then(
      (res: [string, string]) => {
        options["polkadot-parachain"] = {
          name: "polkadot-parachain",
          url: res[0],
          size: res[1],
        };
        resolve();
      },
    );
  });

  // If the platform is MacOS then the polkadot repo needs to be cloned and run locally by the user
  // as polkadot do not release a binary for MacOS
  if (process.platform === "darwin" && params.includes("polkadot")) {
    console.log(
      `${decorators.yellow(
        "Note: ",
      )} You are using MacOS. Please, clone the polkadot repo ` +
        decorators.cyan("(https://github.com/paritytech/polkadot)") +
        ` and run it locally.\n At the moment there is no polkadot binary for MacOs.\n\n`,
    );
    const index = params.indexOf("polkadot");
    if (index !== -1) {
      params.splice(index, 1);
    }
  }

  if (params.length === 0) {
    console.log(decorators.green("No binaries to download. Exiting..."));
    return;
  }
  let count = 0;
  console.log("Setup will start to download binaries:");
  params.forEach((a: any) => {
    if (!POSSIBLE_BINARIES.includes(a)) {
      const index = params.indexOf(a);
      index > -1 && params.splice(index, 1);
      console.log(
        decorators.red(
          `"${a}" is not one of the possible options for this setup and will be skipped;`,
        ),
        decorators.green(` Valid options: polkadot polkadot-parachain`),
      );
      return;
    }
    const size = parseInt(options[a]?.size || "0", 10);
    count += size;
    console.log("-", a, "\t Approx. size ", size, " MB");
  });
  console.log("Total approx. size: ", count, "MB");
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
  downloadBinaries(params);
  return;
}

// helper fns
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

    for (let binary of binaries) {
      promises.push(
        new Promise<void>(async (resolve, reject) => {
          let result = options[binary];
          if (!result) {
            console.log("options", options, "binary", binary);
            throw new Error("Binary is not defined");
          }
          const { url, name } = result;

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
          const writer = fs.createWriteStream(path.resolve(name));

          while (true) {
            const read = await reader?.read()!;
            if (read?.done) {
              writer.close();
              resolve();
              break;
            }

            loaded += read.value.length;
            progressBar.increment();
            progressBar.update(loaded, {
              filename: name,
            });
            writer.write(read.value);
          }
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
    let tag_name;

    const allReleases = await releases.json();
    const release = allReleases.find((r: any) => {
      obj = r?.assets?.find((a: any) => a.name === name);
      return Boolean(obj);
    });

    tag_name = release.tag_name;

    if (!tag_name) {
      throw new Error(
        "Should never come to this point. Tag_name should never be undefined!",
      );
    }

    return [
      `https://github.com/paritytech/${repo}/releases/download/${tag_name}/${name}`,
      convertBytes(obj.size),
    ];
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
