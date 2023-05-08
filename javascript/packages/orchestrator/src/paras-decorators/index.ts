enum PARA {
  Statemint = "statemint",
  Moonbeam = "moonbeam",
  Efinity = "efinity",
  Acala = "acala",
  Astar = "astar",
  Bifrost = "bifrost",
  Equilibrium = "equilibrium",
  Oak = "oak",
  Mangata = "mangata",
  Generic = "generic",
  LocalV = "local_v",
}

interface ParaDecorator {
  [fn: string]: Function;
}

// imports
import acala from "./acala";
import astar from "./astar";
import bifrost from "./bifrost";
import efinity from "./efinity";
import equilibrium from "./equilibrium";
import mangata from "./mangata";
import moonbeam from "./moonbeam";
import oak from "./oak";
import statemint from "./statemint";
import local_v from "./local-v";

function whichPara(chain: string): PARA {
  if (chain.includes("statemint")) return PARA.Statemint;
  if (/moonbase|moonriver|moonbeam/.test(chain)) return PARA.Moonbeam;
  if (/efinity|rocfinity/.test(chain)) return PARA.Efinity;
  if (/acala|karura|mandala/.test(chain)) return PARA.Acala;
  if (/astar|shiden|shibuya/.test(chain)) return PARA.Astar;
  if (/bifrost/.test(chain)) return PARA.Bifrost;
  if (/equilibrium|genshiro/.test(chain)) return PARA.Equilibrium;
  if (/oak|turing|neumann/.test(chain)) return PARA.Oak;
  if (/mangata/.test(chain)) return PARA.Mangata;
  if (/local-v/.test(chain)) return PARA.LocalV;

  return PARA.Generic;
}

const moonbeamDecorators: ParaDecorator = Object.keys(moonbeam).reduce(
  (memo, fn) => {
    memo[fn] = (moonbeam as ParaDecorator)[fn];
    return memo;
  },
  Object.create({}),
);

const statemintDecorators: ParaDecorator = Object.keys(statemint).reduce(
  (memo, fn) => {
    memo[fn] = (statemint as ParaDecorator)[fn];
    return memo;
  },
  Object.create({}),
);

const efinityDecorators: ParaDecorator = Object.keys(efinity).reduce(
  (memo, fn) => {
    memo[fn] = (efinity as ParaDecorator)[fn];
    return memo;
  },
  Object.create({}),
);

const acalaDecorators: ParaDecorator = Object.keys(acala).reduce((memo, fn) => {
  memo[fn] = (acala as ParaDecorator)[fn];
  return memo;
}, Object.create({}));

const astarDecorators: ParaDecorator = Object.keys(astar).reduce((memo, fn) => {
  memo[fn] = (astar as ParaDecorator)[fn];
  return memo;
}, Object.create({}));

const bifrostDecorators: ParaDecorator = Object.keys(bifrost).reduce(
  (memo, fn) => {
    memo[fn] = (bifrost as ParaDecorator)[fn];
    return memo;
  },
  Object.create({}),
);

const eqDecorators: ParaDecorator = Object.keys(equilibrium).reduce(
  (memo, fn) => {
    memo[fn] = (equilibrium as ParaDecorator)[fn];
    return memo;
  },
  Object.create({}),
);

const oakDecorators: ParaDecorator = Object.keys(oak).reduce((memo, fn) => {
  memo[fn] = (oak as ParaDecorator)[fn];
  return memo;
}, Object.create({}));

const mangataDecorators: ParaDecorator = Object.keys(mangata).reduce(
  (memo, fn) => {
    memo[fn] = (mangata as ParaDecorator)[fn];
    return memo;
  },
  Object.create({}),
);

const localVDecorators: ParaDecorator = Object.keys(local_v).reduce(
  (memo, fn) => {
    memo[fn] = (local_v as ParaDecorator)[fn];
    return memo;
  },
  Object.create({}),
);

const decorators: { [para in PARA]: { [fn: string]: Function } } = {
  moonbeam: moonbeamDecorators,
  statemint: statemintDecorators,
  efinity: efinityDecorators,
  acala: acalaDecorators,
  astar: astarDecorators,
  bifrost: bifrostDecorators,
  equilibrium: eqDecorators,
  oak: oakDecorators,
  mangata: mangataDecorators,
  local_v: localVDecorators,
  generic: {},
};

function decorate(para: PARA, fns: Function[]) {
  const decorated = fns.map((fn) => {
    return decorators[para][fn.name] ? decorators[para][fn.name] : fn;
  });

  return decorated;
}

export { whichPara, decorate, PARA };
