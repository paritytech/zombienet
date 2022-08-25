import readline from "readline";
import { decorators } from "./utils/colors";
import fs from "fs";
import path from "path";
import axios from "axios";
import progress from "progress";

const DEFAULT_CUMULUS_COLLATOR_URL =
  "https://github.com/paritytech/cumulus/releases/download/v0.9.270/polkadot-parachain";
// const DEFAULT_ADDER_COLLATOR_URL =
//   "https://gitlab.parity.io/parity/mirrors/polkadot/-/jobs/1769497/artifacts/raw/artifacts/adder-collator";

interface OptIf {
  [key: string]: { name: string; url?: string; size: string };
}

const latestReleaseURL = async (repo: string, name: string) => {
  try {
    const res = await axios.get(
      `https://api.github.com/repos/paritytech/${repo}/releases/latest`,
    );
    console.log("res", res.data.assets);
    return `https://github.com/paritytech/${repo}/releases/download/${res.data.tag_name}/${name}`;
  } catch (err: any) {
    if (err.code === "ENOTFOUND") {
      throw new Error("Network error.");
    } else if (err.response && err.response.status === 404) {
      throw new Error("Could not find a release.");
    }
    throw new Error(err);
  }
};

const options: OptIf = {
  polkadot: {
    name: "polkadot",
    size: "130",
  },
  parachain: {
    name: "parachain",
    url: DEFAULT_CUMULUS_COLLATOR_URL,
    size: "120",
  },
  // // Deactivate for now
  // adderCollator: {
  //   name: "adderCollator",
  //   url: DEFAULT_ADDER_COLLATOR_URL,
  //   size: "950",
  // },
};

latestReleaseURL("polkadot", "polkadot").then(
  (res) => (options.polkadot.url = res),
);

const dec = (color: string, msg: string): string => decorators[color](msg);

const askQuestion = async (query: string): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    }),
  );
};

// Download the binaries
const downloadBinaries = async (binaries: string[]): Promise<void> => {
  console.log(`${dec("yellow", "\nStart download...\n")}`);
  const promises = [];
  let count = 0;
  for (let binary of binaries) {
    promises.push(
      new Promise<void>(async (resolve) => {
        const { url, name } = options[binary];
        const { data, headers } = await axios({
          url,
          method: "GET",
          responseType: "stream",
        });
        const totalLength = headers["content-length"];

        const progressBar = new progress(
          "-> downloading [:bar] :percent :etas",
          {
            width: 40,
            complete: "=",
            incomplete: " ",
            renderThrottle: 1,
            total: parseInt(totalLength),
          },
        );

        const writer = fs.createWriteStream(path.resolve(__dirname, name));

        data.on("data", (chunk: any) => progressBar.tick(chunk.length));
        data.pipe(writer);
        data.on("end", () => {
          console.log(dec("yellow", `Binary "${name}" downloaded`));
          // Add permissions to the binary
          console.log(dec("cyan", `Giving permissions to "${name}"`));
          fs.chmodSync(path.resolve(__dirname, name), 0o755);
          resolve();
        });
      }),
    );
  }
  await Promise.all(promises);
  console.log(
    dec("cyan", `Please add the dir to your $PATH by running the command:`),
    "\n",
    dec("blue", `export PATH=${__dirname}:$PATH`),
  );
};

const howTo = () => {
  const msg = [];
  msg.push(
    "Setup is meant for downloading and making everything ready for dev environment of ZombieNet;\n",
  );
  msg.push("You can use the following arguments:\n");
  msg.push(`${dec("yellow", "--help or -h")} shows this message;`);
  msg.push(
    `${dec(
      "yellow",
      "--binaries or -b:",
    )} the binaries that you want to be downloaded, provided in a row without any separators; They are downloaded in 'dist' directory and appropriate executable permissions are assigned.`,
  );
  msg.push(`\tpossible options: ${dec("cyan", "'polkadot', 'parachain'")}`);
  msg.push(
    `\texample: ${dec("blue", "node dist/setup.js -b polkadot parachain")}`,
  );
  console.log(msg.join("\n"));
};

const { argv } = process;
argv.splice(0, 2);

const execute = async () => {
  switch (argv[0]) {
    case undefined:
      console.error(`Error: ${dec("red", "No command specified")}`);
      howTo();
      break;
    case "--help":
    case "-h":
      howTo();
      break;
    case "--binaries":
    case "-b":
      argv.splice(0, 1);
      let count = 0;
      console.log("Setup will start to download binaries:");
      argv.forEach((a) => {
        const size = parseInt(options[a].size, 10);
        count += size;
        console.log("-", a, "\t Approx. size ", size, " MB");
      });
      console.log("Total approx. size: ", count, "MB");
      const response = await askQuestion("Do you want to continue? (y/n)");
      if (response.toLowerCase() !== "n" && response.toLowerCase() !== "y") {
        console.log("Invalid input. Exiting...");
        break;
      }
      if (response.toLowerCase() === "n") {
        break;
      }
      downloadBinaries(argv);
      break;
  }
};

console.log(
  `\n🧟🧟🧟 ${dec("green", "ZombieNet dev environment setup ")}🧟🧟🧟\n`,
);
execute();
