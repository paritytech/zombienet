import type {
  NodeConfig,
  PL_ConfigType,
  ParachainConfig,
  PolkadotLaunchConfig,
} from "@zombienet/orchestrator";
import { decorators, getFilePathNameExt } from "@zombienet/utils";
import fs from "fs";
import path from "path";
import { DEFAULT_BALANCE } from "../constants";

export async function convert(param: string) {
  try {
    const filePath = param;

    if (!filePath) {
      throw Error("Path of configuration file was not provided");
    }

    // Read through the JSON and write to stream sample
    await convertInput(filePath);
  } catch (err) {
    console.log(
      `\n ${decorators.red("Error: ")} \t ${decorators.bright(err)}\n`,
    );
  }
}

// Convert functions
// Read the input file
async function readInputFile(
  ext: string,
  fPath: string,
): Promise<PL_ConfigType> {
  if (ext === "json" || ext === "js") {
     return  ext === "json"
        ? JSON.parse(fs.readFileSync(`${fPath}`, "utf8"))
        : await import(path.resolve(fPath));
  }
  
  throw Error("No valid extension was found.");
}

async function convertInput(filePath: string) {
  const { fullPath, fileName, extension } = getFilePathNameExt(filePath);

  const convertedJson = await readInputFile(extension, filePath);

  const { relaychain, parachains = [], simpleParachains = [], hrmpChannels = [], types } =
    convertedJson;

  let jsonOutput: PolkadotLaunchConfig;
  const nodes: NodeConfig[] = [];
  let paras: ParachainConfig[] = [];
  let collators: NodeConfig[] = [];

  const DEFAULT_NODE_VALUES = {
    validator: true,
    invulnerable: true,
    balance: DEFAULT_BALANCE,
  };

    parachains.forEach((parachain: any) => {
      collators = [];
      parachain.nodes.forEach((n: any) => {
        collators.push({
          name: n.name,
          command: "adder-collator",
          ...DEFAULT_NODE_VALUES,
        });
      });
      paras.push({
        id: parachain.id,
        collators,
      });
    });

  collators = [];

    simpleParachains.forEach((sp: any) => {
      collators.push({
        name: sp.name,
        command: "adder-collator",
        ...DEFAULT_NODE_VALUES,
      });
      paras.push({
        id: sp.id,
        collators,
      });
    });

  if (relaychain?.nodes) {
    relaychain.nodes.forEach((n: any) => {
      nodes.push({
        name: `"${n.name}"`,
        ...DEFAULT_NODE_VALUES,
      });
    });
  }

  jsonOutput = {
    relaychain: {
      default_image: "docker.io/paritypr/polkadot-debug:master",
      default_command: "polkadot",
      default_args: ["-lparachain=debug"],
      chain: relaychain?.chain || "",
      nodes,
      genesis: relaychain?.genesis,
    },
    types,
    hrmp_channels: hrmpChannels || [],
    parachains: paras,
  };

  fs.writeFile(
    `${fullPath}/${fileName}-zombienet.json`,
    JSON.stringify(jsonOutput),
    (error: any) => {
      if (error) throw error;
    },
  );
  console.log(
    `Converted JSON config exists now under: ${fullPath}/${fileName}-zombienet.json`,
  );
}
