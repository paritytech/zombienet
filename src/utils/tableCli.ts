import Table, {
  GenericTable,
  HorizontalTableRow,
  VerticalTableRow,
  CrossTableRow,
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
  main?: boolean;
  chars?: CharsObj;
}

export class CreateLogTable {
  table: CreatedTable | undefined;
  colWidths: number[];

  constructor({ head, colWidths, main }: TableCreationProps) {
    this.colWidths = colWidths;
    const params: TableCreationProps = { colWidths };

    if (head?.length) params.head = head;

    if (main) {
      params.chars = chars;
    }
    this.table = new Table(params);
  }

  pushTo = (inputs: any[][]) => {
    inputs.forEach((input) => {
      input.forEach((inp, index) => {
        const split = this.colWidths[index] - 10;
        const times = parseInt((inp.length / split).toString());
        if (times > 1) {
          let some = inp;
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
    console.log(this.table!.toString());
  };
}
