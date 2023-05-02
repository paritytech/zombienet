import { encodeAddress } from "@polkadot/util-crypto";
import {
  convertExponentials,
  CreateLogTable,
  decorators,
  getRandom,
  readDataFile,
} from "@zombienet/utils";
import crypto from "crypto";
import fs from "fs";
import { generateKeyFromSeed } from "./keys";
import { ChainSpec, ComputedNetwork, HrmpChannelsConfig, Node } from "./types";
const JSONbig = require("json-bigint")({ useNativeBigInt: true });
const debug = require("debug")("zombie::chain-spec");

const JSONStream = require("JSONStream");

// track 1st staking as default;
let stakingBond: number | undefined;

export type KeyType = "session" | "aura" | "grandpa";

export type GenesisNodeKey = [string, string, { [key: string]: string }];

// Check if the chainSpec have session keys
export function specHaveSessionsKeys(chainSpec: ChainSpec): boolean {
  // Check runtime_genesis_config key for rococo compatibility.
  const runtimeConfig = getRuntimeConfig(chainSpec);

  return (
    runtimeConfig?.session ||
    runtimeConfig?.palletSession ||
    runtimeConfig?.authorMapping
  );
}

// Get authority keys from within chainSpec data
function getAuthorityKeys(chainSpec: ChainSpec, keyType: KeyType = "session") {
  const runtimeConfig = getRuntimeConfig(chainSpec);

  switch (keyType) {
    case "session":
      if (runtimeConfig?.session) return runtimeConfig.session.keys;
      break;
    case "aura":
      if (runtimeConfig?.aura) return runtimeConfig.aura.authorities;
      break;
    case "grandpa":
      if (runtimeConfig?.grandpa) return runtimeConfig.grandpa.authorities;
      break;
  }

  const errorMsg = `⚠ ${keyType} keys not found in runtimeConfig`;
  console.error(`\n\t\t  ${decorators.yellow(errorMsg)}`);
}

// Remove all existing keys from `session.keys` / aura.authorities / grandpa.authorities
export function clearAuthorities(specPath: string) {
  try {
    const chainSpec = readAndParseChainSpec(specPath);
    const runtimeConfig = getRuntimeConfig(chainSpec);

    // clear keys
    if (runtimeConfig?.session) runtimeConfig.session.keys.length = 0;
    // clear aura
    if (runtimeConfig?.aura) runtimeConfig.aura.authorities.length = 0;
    // clear grandpa
    if (runtimeConfig?.grandpa) runtimeConfig.grandpa.authorities.length = 0;

    // clear collatorSelection
    if (runtimeConfig?.collatorSelection)
      runtimeConfig.collatorSelection.invulnerables = [];

    // Clear staking
    if (runtimeConfig?.staking) {
      stakingBond = runtimeConfig.staking.stakers[0][2];
      runtimeConfig.staking.stakers = [];
      runtimeConfig.staking.invulnerables = [];
      runtimeConfig.staking.validatorCount = 0;
    }

    writeChainSpec(specPath, chainSpec);
    const logTable = new CreateLogTable({
      colWidths: [120],
    });
    logTable.pushToPrint([
      [decorators.green("🧹 Starting with a fresh authority set...")],
    ]);
  } catch (err) {
    console.error(`\n${decorators.red("Fail to clear authorities")}`);
    throw err;
  }
}

export async function addBalances(specPath: string, nodes: Node[]) {
  try {
    const chainSpec = readAndParseChainSpec(specPath);
    const runtimeConfig = getRuntimeConfig(chainSpec);
    for (const node of nodes) {
      if (node.balance) {
        const stash_key = node.accounts.sr_stash.address;

        const balanceToAdd = stakingBond
          ? node.validator && node.balance > stakingBond
            ? node.balance
            : stakingBond! + 1
          : node.balance;
        runtimeConfig.balances.balances.push([stash_key, balanceToAdd]);

        const logLine = `👤 Added Balance ${
          node.balance
        } for ${decorators.green(node.name)} - ${decorators.magenta(
          stash_key,
        )}`;
        new CreateLogTable({
          colWidths: [120],
          doubleBorder: true,
        }).pushToPrint([[logLine]]);
      }
    }

    writeChainSpec(specPath, chainSpec);
  } catch (err) {
    console.error(
      `\n${decorators.red(`Fail to add balance for nodes: ${nodes}`)}`,
    );
    throw err;
  }
}

export function getNodeKey(node: Node, useStash = true): GenesisNodeKey {
  try {
    const { sr_stash, sr_account, ed_account, ec_account } = node.accounts;

    const address = useStash ? sr_stash.address : sr_account.address;

    const key: GenesisNodeKey = [
      address,
      address,
      {
        grandpa: ed_account.address,
        babe: sr_account.address,
        im_online: sr_account.address,
        parachain_validator: sr_account.address,
        authority_discovery: sr_account.address,
        para_validator: sr_account.address,
        para_assignment: sr_account.address,
        beefy: encodeAddress(ec_account.publicKey),
        aura: sr_account.address,
      },
    ];

    return key;
  } catch (err) {
    console.error(
      `\n${decorators.red(`Fail to generate key for node: ${node}`)}`,
    );
    throw err;
  }
}

// Add additional authorities to chain spec in `session.keys`
export async function addAuthority(
  specPath: string,
  node: Node,
  key: GenesisNodeKey,
) {
  try {
    const chainSpec = readAndParseChainSpec(specPath);

    const { sr_stash } = node.accounts;

    const keys = getAuthorityKeys(chainSpec);
    if (!keys) return;

    keys.push(key);

    new CreateLogTable({
      colWidths: [30, 20, 70],
    }).pushToPrint([
      [
        decorators.cyan("👤 Added Genesis Authority"),
        decorators.green(node.name),
        decorators.magenta(sr_stash.address),
      ],
    ]);

    writeChainSpec(specPath, chainSpec);
  } catch (err) {
    console.error(
      `\n${decorators.red(`Fail to add authority for node: ${node}`)}`,
    );
    throw err;
  }
}

/// Add node to staking
export async function addStaking(specPath: string, node: Node) {
  try {
    const chainSpec = readAndParseChainSpec(specPath);
    const runtimeConfig = getRuntimeConfig(chainSpec);
    if (!runtimeConfig?.staking) return;

    const { sr_stash, sr_account } = node.accounts;
    runtimeConfig.staking.stakers.push([
      sr_stash.address,
      sr_account.address,
      stakingBond || 1000000000000,
      "Validator",
    ]);

    runtimeConfig.staking.validatorCount += 1;

    // add to invulnerables
    if (node.invulnerable)
      runtimeConfig.staking.invulnerables.push(sr_stash.address);

    new CreateLogTable({
      colWidths: [30, 20, 70],
    }).pushToPrint([
      [
        decorators.cyan("👤 Added Staking"),
        decorators.green(node.name),
        decorators.magenta(sr_stash.address),
      ],
    ]);

    writeChainSpec(specPath, chainSpec);
  } catch (err) {
    console.error(
      `\n${decorators.red(`Fail to add staking for node: ${node}`)}`,
    );
    throw err;
  }
}

/// Add collators
export async function addCollatorSelection(specPath: string, node: Node) {
  try {
    const chainSpec = readAndParseChainSpec(specPath);
    const runtimeConfig = getRuntimeConfig(chainSpec);
    if (!runtimeConfig?.collatorSelection?.invulnerables) return;

    const { sr_account } = node.accounts;

    runtimeConfig.collatorSelection.invulnerables.push(sr_account.address);

    new CreateLogTable({
      colWidths: [30, 20, 70],
    }).pushToPrint([
      [
        decorators.cyan("👤 Added CollatorSelection "),
        decorators.green(node.name),
        decorators.magenta(sr_account.address),
      ],
    ]);

    writeChainSpec(specPath, chainSpec);
  } catch (err) {
    console.error(`\n${decorators.red(`Fail to add collator: ${node}`)}`);
    throw err;
  }
}

export async function addParaCustom() {
  /// noop
}

export async function addAuraAuthority(
  specPath: string,
  name: string,
  accounts: any,
) {
  try {
    const { sr_account } = accounts;

    const chainSpec = readAndParseChainSpec(specPath);

    const keys = getAuthorityKeys(chainSpec, "aura");
    if (!keys) return;

    keys.push(sr_account.address);

    writeChainSpec(specPath, chainSpec);

    new CreateLogTable({
      colWidths: [30, 20, 70],
    }).pushToPrint([
      [
        decorators.cyan("👤 Added Genesis Authority"),
        decorators.green(name),
        decorators.magenta(sr_account.address),
      ],
    ]);
  } catch (err) {
    console.error(
      `\n${decorators.red(`Fail to add Aura account for node: ${name}`)}`,
    );
    throw err;
  }
}

export async function addGrandpaAuthority(
  specPath: string,
  name: string,
  accounts: any,
) {
  try {
    const { ed_account } = accounts;

    const chainSpec = readAndParseChainSpec(specPath);

    const keys = getAuthorityKeys(chainSpec, "grandpa");
    if (!keys) return;

    keys.push([ed_account.address, 1]);

    writeChainSpec(specPath, chainSpec);
    const logLine = `👤 Added Genesis Authority (GRANDPA) ${decorators.green(
      name,
    )} - ${decorators.magenta(ed_account.address)}`;
    new CreateLogTable({ colWidths: [120], doubleBorder: true }).pushToPrint([
      [logLine],
    ]);
  } catch (err) {
    console.error(
      `\n${decorators.red(`Fail to add GrandPa account for node: ${name}`)}`,
    );
    throw err;
  }
}

export async function generateNominators(
  specPath: string,
  randomNominatorsCount: number,
  maxNominations: number,
  validators: string[],
) {
  try {
    const chainSpec = readAndParseChainSpec(specPath);
    const runtimeConfig = getRuntimeConfig(chainSpec);
    if (!runtimeConfig?.staking) return;

    let logLine = `👤 Generating random Nominators (${decorators.green(
      randomNominatorsCount,
    )})`;
    new CreateLogTable({ colWidths: [120], doubleBorder: true }).pushToPrint([
      [logLine],
    ]);

    const maxForRandom = 2 ** 48 - 1;
    for (let i = 0; i < randomNominatorsCount; i++) {
      // create account
      const nom = await generateKeyFromSeed(`nom-${i}`);
      // add to balances
      const balanceToAdd = stakingBond! + 1;
      runtimeConfig.balances.balances.push([nom.address, balanceToAdd]);
      // random nominations
      const count = crypto.randomInt(maxForRandom) % maxNominations;
      const nominations = getRandom(validators, count || count + 1);
      // push to stakers
      runtimeConfig.staking.stakers.push([
        nom.address,
        nom.address,
        stakingBond,
        {
          Nominator: nominations,
        },
      ]);
    }

    writeChainSpec(specPath, chainSpec);
    logLine = `👤 Added random Nominators (${decorators.green(
      randomNominatorsCount,
    )})`;
    new CreateLogTable({ colWidths: [120], doubleBorder: true }).pushToPrint([
      [logLine],
    ]);
  } catch (err) {
    console.error(
      `\n${decorators.red(
        `Fail to generate staking config with count : ${randomNominatorsCount} and max : ${maxNominations}`,
      )}`,
    );
    throw err;
  }
}

// Add parachains to the chain spec at genesis.
export async function addParachainToGenesis(
  specPath: string,
  para_id: string,
  head: string,
  wasm: string,
  parachain = true,
) {
  try {
    const chainSpec = readAndParseChainSpec(specPath);
    const runtimeConfig = getRuntimeConfig(chainSpec);

    let paras = undefined;
    if (runtimeConfig.paras) {
      paras = runtimeConfig.paras.paras;
    }
    // For retro-compatibility with substrate pre Polkadot 0.9.5
    else if (runtimeConfig.parachainsParas) {
      paras = runtimeConfig.parachainsParas.paras;
    }
    if (paras) {
      const new_para = [
        parseInt(para_id),
        [readDataFile(head), readDataFile(wasm), parachain],
      ];

      paras.push(new_para);

      writeChainSpec(specPath, chainSpec);
      const logLine = `${decorators.green(
        "✓ Added Genesis Parachain",
      )} ${para_id}`;
      new CreateLogTable({ colWidths: [120], doubleBorder: true }).pushToPrint([
        [logLine],
      ]);
    } else {
      console.error(
        `\n${decorators.reverse(
          decorators.red("  ⚠ paras not found in runtimeConfig"),
        )}`,
      );
      process.exit(1);
    }
  } catch (err) {
    console.error(
      `\n${decorators.red(`Fail to add para: ${para_id} to genesis`)}`,
    );
    throw err;
  }
}

// Update the runtime config in the genesis.
// It will try to match keys which exist within the configuration and update the value.
export async function changeGenesisConfig(specPath: string, updates: any) {
  try {
    const chainSpec = readAndParseChainSpec(specPath);
    const msg = `⚙ Updating Chain Genesis Configuration (path: ${specPath})`;
    new CreateLogTable({ colWidths: [120], doubleBorder: true }).pushToPrint([
      [`\n\t ${decorators.green(msg)}`],
    ]);

    if (chainSpec.genesis) {
      const config = chainSpec.genesis;
      findAndReplaceConfig(updates, config);

      writeChainSpec(specPath, chainSpec);
    }
  } catch (err) {
    console.error(`\n${decorators.red("Fail to customize genesis")}`);
    throw err;
  }
}

export async function addBootNodes(specPath: string, addresses: string[]) {
  let chainSpec;
  try {
    chainSpec = readAndParseChainSpec(specPath);
  } catch (e: any) {
    if (e.code !== "ERR_FS_FILE_TOO_LARGE") throw e;

    // can't customize bootnodes
    const logLine = ` 🚧 ${decorators.yellow(
      `Chain Spec file ${specPath} is TOO LARGE to customize (more than 2G).`,
    )} 🚧`;
    new CreateLogTable({ colWidths: [120], doubleBorder: true }).pushToPrint([
      [logLine],
    ]);

    return;
  }

  // prevent dups bootnodes
  chainSpec.bootNodes = [...new Set(addresses)];
  writeChainSpec(specPath, chainSpec);
  const logTable = new CreateLogTable({ colWidths: [120] });
  if (addresses.length) {
    logTable.pushToPrint([
      [`${decorators.green(chainSpec.name)} ⚙ Added Boot Nodes`],
      [addresses.join("\n")],
    ]);
  } else {
    logTable.pushToPrint([
      [`${decorators.green(chainSpec.name)} ⚙ Clear Boot Nodes`],
    ]);
  }
}

export async function addHrmpChannelsToGenesis(
  specPath: string,
  hrmp_channels: HrmpChannelsConfig[],
) {
  try {
    new CreateLogTable({ colWidths: [120], doubleBorder: true }).pushToPrint([
      [`\n\t ${decorators.green("Adding Genesis HRMP Channels")}`],
    ]);

    const chainSpec = readAndParseChainSpec(specPath);

    for (const h of hrmp_channels) {
      const newHrmpChannel = [
        h.sender,
        h.recipient,
        h.max_capacity,
        h.max_message_size,
      ];

      const runtimeConfig = getRuntimeConfig(chainSpec);

      let hrmp = undefined;

      if (runtimeConfig.hrmp) {
        hrmp = runtimeConfig.hrmp;
      }
      // For retro-compatibility with substrate pre Polkadot 0.9.5
      else if (runtimeConfig.parachainsHrmp) {
        hrmp = runtimeConfig.parachainsHrmp;
      }

      if (hrmp && hrmp.preopenHrmpChannels) {
        hrmp.preopenHrmpChannels.push(newHrmpChannel);

        new CreateLogTable({
          colWidths: [120],
          doubleBorder: true,
        }).pushToPrint([
          [
            decorators.green(
              `✓ Added HRMP channel ${h.sender} -> ${h.recipient}`,
            ),
          ],
        ]);
      } else {
        console.error(
          `${decorators.reverse(
            decorators.red(`  ⚠ hrmp not found in runtimeConfig`),
          )}`,
        );
        process.exit(1);
      }

      writeChainSpec(specPath, chainSpec);
    }
  } catch (err) {
    console.error(
      `\n${decorators.red(`Fail to add hrmp channels: ${hrmp_channels}`)}`,
    );
    throw err;
  }
}

// Look at the key + values from `obj1` and try to replace them in `obj2`.
function findAndReplaceConfig(obj1: any, obj2: any) {
  // create new Object without null prototype
  const tempObj = { ...obj2 };
  // Look at keys of obj1
  Object.keys(obj1).forEach((key) => {
    // See if obj2 also has this key
    if (tempObj.hasOwnProperty(key)) {
      // If it goes deeper, recurse...
      if (
        obj1[key] !== null &&
        obj1[key] !== undefined &&
        JSON.parse(JSON.stringify(obj1[key])).constructor === Object
      ) {
        findAndReplaceConfig(obj1[key], obj2[key]);
      } else {
        obj2[key] = obj1[key];
        new CreateLogTable({
          colWidths: [120],
          doubleBorder: true,
        }).pushToPrint([
          [
            `${decorators.green(
              "✓ Updated Genesis Configuration",
            )} [ key : ${key} ]`,
          ],
        ]);
        debug(`[ ${key}: ${obj2[key]} ]`);
      }
    } else {
      console.error(
        `\n\t\t  ${decorators.reverse(
          decorators.red("⚠ Bad Genesis Configuration"),
        )} [ ${key}: ${obj1[key]} ]`,
      );
    }
  });
}

export function getRuntimeConfig(chainSpec: any) {
  const runtimeConfig =
    chainSpec.genesis.runtime?.runtime_genesis_config ||
    chainSpec.genesis.runtime;

  return runtimeConfig;
}

export function readAndParseChainSpec(specPath: string) {
  const rawdata = fs.readFileSync(specPath);
  let chainSpec;
  try {
    chainSpec = JSONbig.parse(rawdata);
    return chainSpec;
  } catch {
    console.error(
      `\n\t\t  ${decorators.red("  ⚠ failed to parse the chain spec")}`,
    );
    process.exit(1);
  }
}

export function writeChainSpec(specPath: string, chainSpec: any) {
  try {
    const data = JSONbig.stringify(chainSpec, null, 2);
    fs.writeFileSync(specPath, convertExponentials(data));
  } catch {
    console.error(
      `\n\t\t  ${decorators.reverse(
        decorators.red("  ⚠ failed to write the chain spec with path: "),
      )} ${specPath}`,
    );
    process.exit(1);
  }
}

export async function isRawSpec(specPath: string): Promise<boolean> {
  return new Promise((res) => {
    const stream = fs.createReadStream(specPath, { encoding: "utf8" });
    const parser = JSONStream.parse(["genesis", "raw", "top", /^0x/]);
    stream.pipe(parser);
    parser.on("data", (e: any) => {
      debug(`data: ${e}`);
      stream.destroy();
      return res(true);
    });
    stream.on("end", () => {
      return res(false);
    });
  });
}

export async function getChainIdFromSpec(specPath: string): Promise<string> {
  return new Promise((res) => {
    const stream = fs.createReadStream(specPath, { encoding: "utf8" });
    const parser = JSONStream.parse(["id"]);
    stream.pipe(parser);
    parser.on("data", (id: any) => {
      debug(`data: ${id}`);
      stream.destroy();
      return res(id);
    });
    stream.on("end", () => {
      return res("");
    });
  });
}

export async function customizePlainRelayChain(
  specPath: string,
  networkSpec: ComputedNetwork,
): Promise<void> {
  try {
    // Relay-chain spec customization logic
    const plainRelayChainSpec = readAndParseChainSpec(specPath);
    const keyType = specHaveSessionsKeys(plainRelayChainSpec)
      ? "session"
      : "aura";

    // make genesis overrides first.
    if (networkSpec.relaychain.genesis) {
      await changeGenesisConfig(specPath, networkSpec.relaychain.genesis);
    }

    // Clear all defaults
    clearAuthorities(specPath);

    // add balances for nodes
    await addBalances(specPath, networkSpec.relaychain.nodes);

    // add authorities for nodes
    const validatorKeys = [];
    for (const node of networkSpec.relaychain.nodes) {
      if (node.validator) {
        validatorKeys.push(node.accounts.sr_stash.address);

        if (keyType === "session") {
          const key = getNodeKey(node);
          await addAuthority(specPath, node, key);
        } else {
          await addAuraAuthority(specPath, node.name, node.accounts!);
          await addGrandpaAuthority(specPath, node.name, node.accounts!);
        }

        await addStaking(specPath, node);
      }
    }

    if (networkSpec.relaychain.randomNominatorsCount) {
      await generateNominators(
        specPath,
        networkSpec.relaychain.randomNominatorsCount,
        networkSpec.relaychain.maxNominations,
        validatorKeys,
      );
    }

    if (networkSpec.hrmp_channels) {
      await addHrmpChannelsToGenesis(specPath, networkSpec.hrmp_channels);
    }
  } catch (err) {
    console.log(
      `\n ${decorators.red("Unexpected error: ")} \t ${decorators.bright(
        err,
      )}\n`,
    );
  }
}
export default {
  addAuraAuthority,
  addAuthority,
  changeGenesisConfig,
  clearAuthorities,
  readAndParseChainSpec,
  specHaveSessionsKeys,
  writeChainSpec,
  getNodeKey,
  addParaCustom,
  addCollatorSelection,
  isRawSpec,
  getChainIdFromSpec,
  customizePlainRelayChain,
};
