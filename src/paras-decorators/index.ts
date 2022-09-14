
enum PARA {
    Statemint = "statemint",
    Moonbeam = "moonbeam",
    Generic = "generic"
   }

interface ParaDecorator { [fn: string] : Function };

// imports
import moonbeam from "./moonbeam";


function whichPara(chain: string): PARA {
    if( chain.includes("statemint")) return PARA.Statemint;
    if( chain.match(/["moonbase"|"moonriver"|"moonbeam"]/ig)) return PARA.Moonbeam;

    return PARA.Generic;
}


const moonbeamDecorators: ParaDecorator = Object.keys(moonbeam).reduce((memo, fn) => {
    memo[fn] = (moonbeam as ParaDecorator)[fn];
    return memo;
},Object.create({}));

const decorators : {[para in PARA]: { [fn: string]: Function}} = {
    moonbeam : moonbeamDecorators,
    statemint: {},
    generic: {}
};

function decorate(para: PARA , fns: Function[]) {
    const decorated = fns.map( fn => {
        return (decorators[para][fn.name]) ? decorators[para][fn.name] : fn;
    });

    return decorated;
}

export {
    whichPara,
    decorate,
    PARA,
  };

