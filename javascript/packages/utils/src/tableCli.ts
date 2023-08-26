import Table, {
  CrossTableRow,
  GenericTable,
  HorizontalTableRow,
  VerticalTableRow,
} from "cli-table3";
import { decorators } from "./colors";

type CharsObj = {
  [key in
    | "top"
    | "top-mid"
    | "top-left"
    | "top-right"
    | "bottom"
    | "bottom-mid"
    | "bottom-left"
    | "bottom-right"
    | "left"
    | "left-mid"
    | "mid"
    | "mid-mid"
    | "right"
    | "right-mid"
    | "middle"]: string;
};

const chars: CharsObj = {
  top: "═",
  "top-mid": "╤",
  "top-left": "╔",
  "top-right": "╗",
  bottom: "═",
  "bottom-mid": "╧",
  "bottom-left": "╚",
  "bottom-right": "╝",
  left: "║",
  "left-mid": "╟",
  mid: "─",
  "mid-mid": "┼",
  right: "║",
  "right-mid": "╢",
  middle: "│",
};

type CreatedTable = GenericTable<
  HorizontalTableRow | VerticalTableRow | CrossTableRow
>;

interface TableCreationProps {
  colWidths: number[];
  head?: any[];
  doubleBorder?: boolean;
  chars?: CharsObj;
  wordWrap?: boolean;
}

export type LogType = "json" | "text" | "table" | "silent";

// Module level config.
let logType: LogType = "table";
const logTypeValues = ["json", "text", "table", "silent"];

export const getLogType = (logType: LogType): LogType => {
  if (logTypeValues.includes(logType)) {
    return logType;
  } else {
    logType &&
      console.error(
        `${decorators.red(`
          Argument 'logType' provided ('${logType}') is not one of the accepted params; Falling back to 'table'.
          Possible values: ${logTypeValues.join(
            ", ",
          )} - Defaults to 'table'.\n\n`)}`,
      );
    return "table";
  }
};

export const setLogType = (value: LogType) => {
  logType = value;
};

export class CreateLogTable {
  table: CreatedTable | undefined;
  colWidths: number[];
  wordWrap: boolean;
  text: string[];

  constructor({ head, colWidths, doubleBorder, wordWrap }: TableCreationProps) {
    this.wordWrap = wordWrap || false;
    this.colWidths = colWidths;
    const params: TableCreationProps = { colWidths, wordWrap };

    if (head?.length) params.head = head;

    if (doubleBorder) {
      params.chars = chars;
    }
    this.text = [];
    this.table = new Table(params);
  }

  pushTo = (inputs: any[][]) => {
    Array.isArray(inputs) &&
      inputs.forEach((input) => {
        Array.isArray(input) &&
          input.forEach((inp, index) => {
            const split = this.colWidths[index] - 10;
            const times = parseInt((inp.length / split).toString());
            if (times > 1) {
              const some = inp;
              for (let i = 0; i <= times; i++) {
                if (i === 0) {
                  inp = some.substring(0, split);
                } else {
                  inp += "\n" + some.substring(split * i, split * (i + 1));
                }
              }
              input[index] = inp;
            }
          });
        if (logType === "text") {
          if (input[0] === "\x1B[36mCommand\x1B[0m") {
            input[1] = input[1].replace(/\n/g, " ");
          }
          // if input has a JSON - that means a merged cell
          if (input[0]?.content) {
            input[0] = input[0]?.content;
          }
          console.log(input.join(" : "));
        } else if (logType === "silent") {
          return;
        } else if (logType === "table") {
          this.table!.push(input);
        }
      });
  };

  print = () => {
    if (logType === "silent" || logType === "text") return;
    if (logType === "table") console.log(this.table!.toString());
  };

  // This function makes the process of creating a table, pushing data and printing it faster
  // It is meant to exist in order to reduce the log lines in the code
  pushToPrint = (inputs: any[][]) => {
    this.pushTo(inputs);
    this.print();
  };
}
