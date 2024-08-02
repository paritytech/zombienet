enum CHAIN {
  AssetHubPolkadot = "asset_hub_polkadot",
  Moonbeam = "moonbeam",
  Efinity = "efinity",
  Acala = "acala",
  Astar = "astar",
  Bifrost = "bifrost",
  Equilibrium = "equilibrium",
  Oak = "oak",
  Mangata = "mangata",
  Generic = "generic",
  GenericEvm = "generic_evm",
  LocalV = "local_v",
  MainnetLocalV = "mainnet_local_v",
  Aventus = "aventus",
}

interface Decorator {
  [fn: string]: Function;
}

// imports
import acala from "./acala";
import asset_hub_polkadot from "./asset_hub_polkadot";
import astar from "./astar";
import bifrost from "./bifrost";
import efinity from "./efinity";
import equilibrium from "./equilibrium";
import local_v from "./local-v";
import mainnet_local_v from "./mainnet-local-v";
import mangata from "./mangata";
import moonbeam from "./moonbeam";
import oak from "./oak";
import generic_evm from "./generic-evm";
import aventus from "./aventus";

function whichChain(chain_name: string, force_decorator?: string): CHAIN {
  const chain = force_decorator ? force_decorator : chain_name;
  if (chain.includes("statemint") || chain.includes("asset-hub-polkadot"))
    return CHAIN.AssetHubPolkadot;
  if (/moonbase|moonriver|moonbeam/.test(chain)) return CHAIN.Moonbeam;
  if (/efinity|matrix/.test(chain)) return CHAIN.Efinity;
  if (/acala|karura|mandala/.test(chain)) return CHAIN.Acala;
  if (/astar|shiden|shibuya/.test(chain)) return CHAIN.Astar;
  if (/bifrost/.test(chain)) return CHAIN.Bifrost;
  if (/equilibrium|genshiro/.test(chain)) return CHAIN.Equilibrium;
  if (/oak|turing|neumann/.test(chain)) return CHAIN.Oak;
  if (/mangata/.test(chain)) return CHAIN.Mangata;
  if (/local-v/.test(chain)) return CHAIN.LocalV;
  if (/mainnet-local-v/.test(chain)) return CHAIN.MainnetLocalV;
  if (/generic-evm/.test(chain)) return CHAIN.GenericEvm;
  if (/vow-net|avn-chain/.test(chain)) return CHAIN.Aventus;

  return CHAIN.Generic;
}
const aventusDecorators: Decorator = Object.keys(aventus).reduce((memo, fn) => {
  memo[fn] = (aventus as Decorator)[fn];
  return memo;
}, Object.create({}));

const moonbeamDecorators: Decorator = Object.keys(moonbeam).reduce(
  (memo, fn) => {
    memo[fn] = (moonbeam as Decorator)[fn];
    return memo;
  },
  Object.create({}),
);

const assetHubPolkadotDecorators: Decorator = Object.keys(
  asset_hub_polkadot,
).reduce((memo, fn) => {
  memo[fn] = (asset_hub_polkadot as Decorator)[fn];
  return memo;
}, Object.create({}));

const efinityDecorators: Decorator = Object.keys(efinity).reduce((memo, fn) => {
  memo[fn] = (efinity as Decorator)[fn];
  return memo;
}, Object.create({}));

const acalaDecorators: Decorator = Object.keys(acala).reduce((memo, fn) => {
  memo[fn] = (acala as Decorator)[fn];
  return memo;
}, Object.create({}));

const astarDecorators: Decorator = Object.keys(astar).reduce((memo, fn) => {
  memo[fn] = (astar as Decorator)[fn];
  return memo;
}, Object.create({}));

const bifrostDecorators: Decorator = Object.keys(bifrost).reduce((memo, fn) => {
  memo[fn] = (bifrost as Decorator)[fn];
  return memo;
}, Object.create({}));

const eqDecorators: Decorator = Object.keys(equilibrium).reduce((memo, fn) => {
  memo[fn] = (equilibrium as Decorator)[fn];
  return memo;
}, Object.create({}));

const oakDecorators: Decorator = Object.keys(oak).reduce((memo, fn) => {
  memo[fn] = (oak as Decorator)[fn];
  return memo;
}, Object.create({}));

const mangataDecorators: Decorator = Object.keys(mangata).reduce((memo, fn) => {
  memo[fn] = (mangata as Decorator)[fn];
  return memo;
}, Object.create({}));

const localVDecorators: Decorator = Object.keys(local_v).reduce((memo, fn) => {
  memo[fn] = (local_v as Decorator)[fn];
  return memo;
}, Object.create({}));

const MainnetLocalVDecorators: Decorator = Object.keys(mainnet_local_v).reduce(
  (memo, fn) => {
    memo[fn] = (local_v as Decorator)[fn];
    return memo;
  },
  Object.create({}),
);

const GenericEvmDecorators: Decorator = Object.keys(generic_evm).reduce(
  (memo, fn) => {
    memo[fn] = (generic_evm as Decorator)[fn];
    return memo;
  },
  Object.create({}),
);

const decorators: { [para in CHAIN]: { [fn: string]: Function } } = {
  moonbeam: moonbeamDecorators,
  asset_hub_polkadot: assetHubPolkadotDecorators,
  efinity: efinityDecorators,
  acala: acalaDecorators,
  astar: astarDecorators,
  bifrost: bifrostDecorators,
  equilibrium: eqDecorators,
  oak: oakDecorators,
  mangata: mangataDecorators,
  local_v: localVDecorators,
  mainnet_local_v: MainnetLocalVDecorators,
  generic: {},
  generic_evm: GenericEvmDecorators,
  aventus: aventusDecorators,
};

function decorate(chain: CHAIN, fns: Function[]) {
  const decorated = fns.map((fn) => {
    return decorators[chain][fn.name] ? decorators[chain][fn.name] : fn;
  });

  return decorated;
}

export { CHAIN, decorate, whichChain };
