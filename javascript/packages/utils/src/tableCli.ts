import Table, {
  CrossTableRow,
  GenericTable,
  HorizontalTableRow,
  VerticalTableRow,
} from "cli-table3";

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

// Module level config.
let silent = true;
export function setSilent(value: boolean) {
  silent = value;
}
export class CreateLogTable {
  table: CreatedTable | undefined;
  colWidths: number[];
  wordWrap: boolean;

  constructor({ head, colWidths, doubleBorder, wordWrap }: TableCreationProps) {
    this.wordWrap = wordWrap || false;
    this.colWidths = colWidths;
    const params: TableCreationProps = { colWidths, wordWrap };

    if (head?.length) params.head = head;

    if (doubleBorder) {
      params.chars = chars;
    }
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
        this.table!.push(input);
      });
  };

  print = () => {
    if (!silent) console.log(this.table!.toString());
  };

  // This function makes the process of creating a table, pushing data and printing it faster
  // It is meant to exist in order to reduce the log lines in the code
  pushToPrint = (inputs: any[][]) => {
    this.pushTo(inputs);
    this.print();
  };
}
