import { encodeAddress } from "../_deps/polkadot/util_crypto.ts";
import { decorators } from "./utils/colors.ts";
import { ChainSpec, HrmpChannelsConfig } from "./types.d.ts";
import { readDataFile } from "./utils/fs-utils.ts";
const debug = require("debug")("zombie::chain-spec");

export type KeyType = "session" | "aura";

// Check if the chainSpec have session keys
export function specHaveSessionsKeys(chainSpec: ChainSpec) {
  // Check runtime_genesis_config key for rococo compatibility.
  const runtimeConfig = getRuntimeConfig(chainSpec);

  return (runtimeConfig && runtimeConfig.session) || (runtimeConfig && runtimeConfig.palletSession);
}

// Get authority keys from within chainSpec data
function getAuthorityKeys(chainSpec: ChainSpec, keyType: KeyType = "session") {
  const runtimeConfig = getRuntimeConfig(chainSpec);
  if( keyType === "session") {
    if (runtimeConfig && runtimeConfig.session) {
      return runtimeConfig.session.keys;
    }
  } else {
    if (runtimeConfig && runtimeConfig.aura) {
      return runtimeConfig.aura.authorities;
    }
  }

  const errorMsg = `⚠ ${keyType} keys not found in runtimeConfig`;
  console.error(`\n\t\t  ${decorators.yellow(errorMsg)}`);
}

// Remove all existing keys from `session.keys`
export function clearAuthorities(specPath: string, keyType: KeyType = "session") {
  const chainSpec = readAndParseChainSpec(specPath);

  let keys = getAuthorityKeys(chainSpec, keyType);
  if(! keys) return;

  keys.length = 0;

  if(keyType === "session") {
    const runtime = getRuntimeConfig(chainSpec);
    if(runtime.collatorSelection && runtime.collatorSelection.invulnerables) runtime.collatorSelection.invulnerables.length = 0;
  }

  writeChainSpec(specPath, chainSpec);
  console.log(
    `\n\t\t🧹 ${decorators.green("Starting with a fresh authority set...")}`
  );
}

// Add additional authorities to chain spec in `session.keys`
export async function addAuthority(specPath: string, name: string, accounts: any, useStash: boolean = true, isStatemint: boolean = false) {
  const { sr_stash, sr_account, ed_account, ec_account } = accounts;

  const key = [
    useStash ? sr_stash.address : sr_account.address,
    useStash ? sr_stash.address : sr_account.address,
    {
      grandpa: ed_account.address,
      babe: sr_account.address,
      im_online: sr_account.address,
      parachain_validator: sr_account.address,
      authority_discovery: sr_account.address,
      para_validator: sr_account.address,
      para_assignment: sr_account.address,
      beefy: encodeAddress(ec_account.publicKey),
      aura: isStatemint ? ed_account.address : sr_account.address,
    },
  ];

  const chainSpec = readAndParseChainSpec(specPath);

  let keys = getAuthorityKeys(chainSpec);
  if(! keys) return;

  keys.push(key);

  // Collators
  const runtime = getRuntimeConfig(chainSpec);
  if(runtime.collatorSelection && runtime.collatorSelection.invulnerables) runtime.collatorSelection.invulnerables.push(sr_account.address);


  writeChainSpec(specPath, chainSpec);
  console.log(
    `\t\t\t  👤 Added Genesis Authority ${decorators.green(
      name
    )} - ${decorators.magenta(sr_stash.address)}`
  );
}


export async function addAuraAuthority(specPath: string, name: string, accounts: any) {
  const { sr_account } = accounts;

  const chainSpec = readAndParseChainSpec(specPath);

  let keys = getAuthorityKeys(chainSpec, "aura");
  if(! keys) return;

  keys.push(sr_account.address);

  writeChainSpec(specPath, chainSpec);
  console.log(
    `\t\t\t  👤 Added Genesis Authority (AURA) ${decorators.green(
      name
    )} - ${decorators.magenta(sr_account.address)}`
  );
}

// Add parachains to the chain spec at genesis.
export async function addParachainToGenesis(
  specPath: string,
  para_id: string,
  head: string,
  wasm: string,
  parachain: boolean = true
) {
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
    let new_para = [
      parseInt(para_id),
      [readDataFile(head), readDataFile(wasm), parachain],
    ];

    paras.push(new_para);

    writeChainSpec(specPath, chainSpec);
    console.log(
      `\n\t\t  ${decorators.green("✓ Added Genesis Parachain")} ${para_id}`
    );
  } else {
    console.error(
      `\n\t\t  ${decorators.red("  ⚠ paras not found in runtimeConfig")}`
    );
    process.exit(1);
  }
}

// Update the runtime config in the genesis.
// It will try to match keys which exist within the configuration and update the value.
export async function changeGenesisConfig(specPath: string, updates: any) {
  const chainSpec = readAndParseChainSpec(specPath);
  const msg = `⚙ Updating Chain Genesis Configuration (path: ${specPath})`;
  console.log(
    `\n\t\t ${decorators.green(msg)}`
  );

  if (chainSpec.genesis) {
    let config = chainSpec.genesis;
    findAndReplaceConfig(updates, config);

    writeChainSpec(specPath, chainSpec);
  }
}

export async function addBootNodes(specPath: string, addresses: string[]) {
  const chainSpec = readAndParseChainSpec(specPath);
  // prevent dups bootnodes
  chainSpec.bootNodes = [...new Set(addresses)];
  writeChainSpec(specPath, chainSpec);

  if (addresses.length) {
    console.log(
      `\n\t\t ${decorators.green("⚙ Added Boot Nodes: ")} ${addresses}`
    );
  } else {
    console.log(`\n\t\t ${decorators.green("⚙ Clear Boot Nodes")}`);
  }
}

export async function addHrmpChannelsToGenesis(
  specPath: string,
  hrmpChannels: HrmpChannelsConfig[]
) {
  console.log(`\n\t\t ⛓  ${decorators.green("Adding Genesis HRMP Channels")}`);

  const chainSpec = readAndParseChainSpec(specPath);

  for (const hrmpChannel of hrmpChannels) {
    let newHrmpChannel = [
      hrmpChannel.sender,
      hrmpChannel.recipient,
      hrmpChannel.maxCapacity,
      hrmpChannel.maxMessageSize,
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

      console.log(
        decorators.green(`\t\t\t  ✓ Added HRMP channel ${hrmpChannel.sender} -> ${hrmpChannel.recipient}`)
      );
    } else {
      console.error("  ⚠ hrmp not found in runtimeConfig");
      process.exit(1);
    }

    writeChainSpec(specPath, chainSpec);
  }
}

// Look at the key + values from `obj1` and try to replace them in `obj2`.
function findAndReplaceConfig(obj1: any, obj2: any) {
  // Look at keys of obj1
  Object.keys(obj1).forEach((key) => {
    // See if obj2 also has this key
    if (obj2.hasOwnProperty(key)) {
      // If it goes deeper, recurse...
      if (
        obj1[key] !== null &&
        obj1[key] !== undefined &&
        JSON.parse(JSON.stringify(obj1[key])).constructor === Object
      ) {
        findAndReplaceConfig(obj1[key], obj2[key]);
      } else {
        obj2[key] = obj1[key];
        console.log(
          `\n\t\t  ${decorators.green(
            "✓ Updated Genesis Configuration"
            )} [ key : ${key} ]`
        );
        debug(`[ ${key}: ${JSON.parse(JSON.stringify(obj2))[key]} ]`);
      }
    } else {
      console.error(
        `\n\t\t  ${decorators.red("⚠ Bad Genesis Configuration")} [ ${key}: ${
          obj1[key]
        } ]`
      );
    }
  });
}

function getRuntimeConfig(chainSpec: any) {
  const runtimeConfig =
    chainSpec.genesis.runtime?.runtime_genesis_config ||
    chainSpec.genesis.runtime;

  return runtimeConfig;
}

function readAndParseChainSpec(specPath: string) {
  let rawdata = Deno.readTextFileSync(specPath);
  let chainSpec;
  try {
    chainSpec = JSON.parse(rawdata);
    return chainSpec;
  } catch {
    console.error(
      `\n\t\t  ${decorators.red("  ⚠ failed to parse the chain spec")}`
    );
    Deno.exit(1);
  }
}

function writeChainSpec(specPath: string, chainSpec: any) {
  try {
    let data = JSON.stringify(chainSpec, null, 2);
    Deno.writeTextFileSync(specPath, data);
  } catch {
    console.error(
      `\n\t\t  ${decorators.red("  ⚠ failed to write the chain spec with path: ")} ${specPath}`
    );
    Deno.exit(1);
  }
}