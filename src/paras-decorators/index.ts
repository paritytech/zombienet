enum PARA {
  Statemint = "statemint",
  Moonbeam = "moonbeam",
  Efinity = "efinity",
  Generic = "generic",
}

interface ParaDecorator {
  [fn: string]: Function;
}

// imports
import moonbeam from "./moonbeam";
import statemint from "./statemint";
import efinity from "./efinity";

function whichPara(chain: string): PARA {
  if (chain.includes("statemint")) return PARA.Statemint;
  if (/moonbase|moonriver|moonbeam/.test(chain)) return PARA.Moonbeam;
  if (/efinity|rocfinity/.test(chain)) return PARA.Efinity;

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

const decorators: { [para in PARA]: { [fn: string]: Function } } = {
  moonbeam: moonbeamDecorators,
  statemint: statemintDecorators,
  efinity: efinityDecorators,
  generic: {},
};

function decorate(para: PARA, fns: Function[]) {
  const decorated = fns.map((fn) => {
    return decorators[para][fn.name] ? decorators[para][fn.name] : fn;
  });

  return decorated;
}

export { whichPara, decorate, PARA };
