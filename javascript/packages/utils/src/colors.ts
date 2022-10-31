const reset = "\x1b[0m";

const colorMap = {
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bg_black: "\x1b[40m",
  bg_red: "\x1b[41m",
  bg_green: "\x1b[42m",
  bg_yellow: "\x1b[43m",
  bg_blue: "\x1b[44m",
  bg_magenta: "\x1b[45m",
  bg_cyan: "\x1b[46m",
  bg_white: "\x1b[47m",
};

const colorFns: any = {};
for (const [color, code] of Object.entries(colorMap)) {
  colorFns[color] = function (input: string): string {
    let ret = `${code}${input}${reset}`;
    return ret;
  };
}

export const decorators = colorFns;
