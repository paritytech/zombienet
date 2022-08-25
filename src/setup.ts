import readline from "readline";
import {
  DEFAULT_COMMAND_URL,
  DEFAULT_CUMULUS_COLLATOR_URL,
  // DEFAULT_ADDER_COLLATOR_URL,
} from "./constants";
import { decorators } from "./utils/colors";
import fs from "fs";
import { exec } from "child_process";
import path from "path";
import axios from "axios";
import progress from "progress";

const polkadot = DEFAULT_COMMAND_URL;
const parachain = DEFAULT_CUMULUS_COLLATOR_URL;
// This will be activated once the binary is ready
// const collator = DEFAULT_ADDER_COLLATOR_URL;

interface OptIf {
  [key: string]: { name: string; url: string; size: string };
}

const options: OptIf = {
  polkadot: { name: "polkadot", url: DEFAULT_COMMAND_URL, size: "131" },
  parachain: {
    name: "parachain",
    url: DEFAULT_CUMULUS_COLLATOR_URL,
    size: "117",
  },
};

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
  console.log("\nStart download...\n");
  const promises = await binaries.map(async (binary: string) => {
    const { url, name } = options[binary];
    // if (fs.existsSync(path.resolve(__dirname, name))) {
    //   console.log("Binary already exists. Do you want to overwrite it? (y/n)");
    //   const response = await askQuestion("Do you want to continue? (y/n)");
    //   if (response.toLowerCase() !== "n" && response.toLowerCase() !== "y") {
    //     console.log("Invalid input. Exiting...");
    //     return;
    //   }
    //   if (response.toLowerCase() === "n") {
    //     return;
    //   }
    // }
    console.log(`${dec("yellow", "Connecting …")}`);
    const { data, headers } = await axios({
      url,
      method: "GET",
      responseType: "stream",
    });
    const totalLength = headers["content-length"];

    console.log("Starting download");
    const progressBar = new progress("-> downloading [:bar] :percent :etas", {
      width: 40,
      complete: "=",
      incomplete: " ",
      renderThrottle: 1,
      total: parseInt(totalLength),
    });

    const writer = fs.createWriteStream(path.resolve(__dirname, name));

    data.on("data", (chunk: any) => progressBar.tick(chunk.length));
    data.pipe(writer);
    data.on("end", () => {
      console.log(dec("yellow", "Download finished."));
      // Add permissions to the binary
      console.log(dec("yellow", "Giving permissions..."));
      fs.chmodSync(path.resolve(__dirname, name), 0o755);
      // Add all binaries to the PATH
      console.log(dec("yellow", "Add to PATH."));
    });
  });
  await Promise.all(promises);
};

const howTo = () => {
  const msg = [];
  msg.push(
    "Setup is meant for downloading and making everything ready for dev environment of ZombieNet;\n",
  );
  msg.push("You can use the following arguments:\n");
  msg.push(`${dec("yellow", "--help")} shows this message;`);
  msg.push(
    `${dec(
      "yellow",
      "--binaries or -b:",
    )} the binaries that you want to be downloaded and installed during the setup, provided in a row without any separators;`,
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

console.log(`\n🧟🧟🧟 ${dec("green", "ZombieNet dev setup ")}🧟🧟🧟\n`);
execute();
