// extracted from https://github.com/yunyu/parse-prometheus-text-format

const STATE_NAME = 0;
const STATE_STARTOFLABELNAME = 1;
const STATE_ENDOFNAME = 2;
const STATE_VALUE = 3;
const STATE_ENDOFLABELS = 4;
const STATE_LABELNAME = 5;
const STATE_LABELVALUEQUOTE = 6;
const STATE_LABELVALUEEQUALS = 7;
const STATE_LABELVALUE = 8;
const STATE_LABELVALUESLASH = 9;
const STATE_NEXTLABEL = 10;
const STATE_TIMESTAMP = 11;

export function parseLine(line: string) {
  let name = "";
  let labelname = "";
  let labelvalue = "";
  let value = "";
  let timestamp = "";
  const labels: Map<string, string> = new Map();
  let state = STATE_NAME;

  for (let c = 0; c < line.length; ++c) {
    const char = line.charAt(c);
    if (state === STATE_NAME) {
      if (char === "{") {
        state = STATE_STARTOFLABELNAME;
      } else if (char === " " || char === "\t") {
        state = STATE_ENDOFNAME;
      } else {
        name += char;
      }
    } else if (state === STATE_ENDOFNAME) {
      if (char === " " || char === "\t") {
        // do nothing
      } else if (char === "{") {
        state = STATE_STARTOFLABELNAME;
      } else {
        value += char;
        state = STATE_VALUE;
      }
    } else if (state === STATE_STARTOFLABELNAME) {
      if (char === " " || char === "\t") {
        // do nothing
      } else if (char === "}") {
        state = STATE_ENDOFLABELS;
      } else {
        labelname += char;
        state = STATE_LABELNAME;
      }
    } else if (state === STATE_LABELNAME) {
      if (char === "=") {
        state = STATE_LABELVALUEQUOTE;
      } else if (char === "}") {
        state = STATE_ENDOFLABELS;
      } else if (char === " " || char === "\t") {
        state = STATE_LABELVALUEEQUALS;
      } else {
        labelname += char;
      }
    } else if (state === STATE_LABELVALUEEQUALS) {
      if (char === "=") {
        state = STATE_LABELVALUEQUOTE;
      } else if (char === " " || char === "\t") {
        // do nothing
      } else {
        throw new Error("Invalid line");
      }
    } else if (state === STATE_LABELVALUEQUOTE) {
      if (char === '"') {
        state = STATE_LABELVALUE;
      } else if (char === " " || char === "\t") {
        // do nothing
      } else {
        throw new Error("Invalid line");
      }
    } else if (state === STATE_LABELVALUE) {
      if (char === "\\") {
        state = STATE_LABELVALUESLASH;
      } else if (char === '"') {
        labels.set(labelname, labelvalue);
        labelname = "";
        labelvalue = "";
        state = STATE_NEXTLABEL;
      } else {
        labelvalue += char;
      }
    } else if (state === STATE_LABELVALUESLASH) {
      state = STATE_LABELVALUE;
      if (char === "\\") {
        labelvalue += "\\";
      } else if (char === "n") {
        labelvalue += "\n";
      } else if (char === '"') {
        labelvalue += '"';
      } else {
        labelvalue += `\\${char}`;
      }
    } else if (state === STATE_NEXTLABEL) {
      if (char === ",") {
        state = STATE_LABELNAME;
      } else if (char === "}") {
        state = STATE_ENDOFLABELS;
      } else if (char === " " || char === "\t") {
        // do nothing
      } else {
        throw new Error("Invalid line");
      }
    } else if (state === STATE_ENDOFLABELS) {
      if (char === " " || char === "\t") {
        // do nothing
      } else {
        value += char;
        state = STATE_VALUE;
      }
    } else if (state === STATE_VALUE) {
      if (char === " " || char === "\t") {
        state = STATE_TIMESTAMP;
      } else {
        value += char;
      }
    } else if (state === STATE_TIMESTAMP) {
      if (char === " " || char === "\t") {
        // do nothing
      } else {
        timestamp += char;
      }
    }
  }

  const ret: any = {
    name,
    value,
  };
  if (labels) {
    ret.labels = labels;
  }
  if (timestamp) {
    ret.timestamp_ms = timestamp;
  }
  return ret;
}
