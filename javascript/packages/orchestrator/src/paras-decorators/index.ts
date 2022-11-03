enum PARA {
  Statemint = "statemint",
  Moonbeam = "moonbeam",
  Efinity = "efinity",
  Acala = "acala",
  Bifrost = "bifrost",
  Generic = "generic",
}

interface ParaDecorator {
  [fn: string]: Function;
}

// imports
import acala from "./acala";
import bifrost from "./bifrost";
import efinity from "./efinity";
import moonbeam from "./moonbeam";
import statemint from "./statemint";

function whichPara(chain: string): PARA {
  if (chain.includes("statemint")) return PARA.Statemint;
  if (/moonbase|moonriver|moonbeam/.test(chain)) return PARA.Moonbeam;
  if (/efinity|rocfinity/.test(chain)) return PARA.Efinity;
  if (/acala|karura|mandala/.test(chain)) return PARA.Acala;
  if (/bifrost/.test(chain)) return PARA.Bifrost;

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

const bifrostDecorators: ParaDecorator = Object.keys(bifrost).reduce(
  (memo, fn) => {
    memo[fn] = (bifrost as ParaDecorator)[fn];
    return memo;
  },
  Object.create({}),
);

const decorators: { [para in PARA]: { [fn: string]: Function } } = {
  moonbeam: moonbeamDecorators,
  statemint: statemintDecorators,
  efinity: efinityDecorators,
  acala: acalaDecorators,
  bifrost: bifrostDecorators,
  generic: {},
};

function decorate(para: PARA, fns: Function[]) {
  const decorated = fns.map((fn) => {
    return decorators[para][fn.name] ? decorators[para][fn.name] : fn;
  });

  return decorated;
}

export { whichPara, decorate, PARA };
