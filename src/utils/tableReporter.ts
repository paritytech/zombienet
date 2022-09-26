import Mocha from "mocha";

import { CreateLogTable } from "../utils/tableCli";
import { decorators } from "../utils/colors";

const { EVENT_RUN_END, EVENT_TEST_FAIL, EVENT_TEST_PASS } =
  Mocha.Runner.constants;

interface TableReporterProps {
  runner: Mocha.Runner;
  stats: Mocha.Stats;
  on: any;
}

class TableReporter {
  constructor(runner: TableReporterProps) {
    const stats = runner.stats!;

    const logTable = new CreateLogTable({
      head: [
        {
          colSpan: 2,
          hAlign: "center",
          content: `${decorators.green("Test Results")}`,
        },
      ],
      colWidths: [30, 100],
    });

    runner
      .on(EVENT_TEST_PASS, (test: Mocha.Test) => {
        logTable.pushTo([
          [
            new Date().toLocaleString(),
            `✅ ${test.title} ${decorators.red(`(${test.duration}ms)`)}`,
          ],
        ]);
      })
      .on(EVENT_TEST_FAIL, (test: Mocha.Test, err: any) => {
        logTable.pushTo([
          [
            new Date().toLocaleString(),
            `❌ ${test.title} ${decorators.red(`(${test.duration}ms)`)}`,
          ],
        ]);
      })
      .once(EVENT_RUN_END, () => {
        logTable.pushTo([
          [
            {
              colSpan: 2,
              hAlign: "left",
              content: `Result: ${stats.passes}/${
                stats.passes + stats.failures
              }`,
            },
          ],
        ]);
        logTable.print();
      });
  }
}

module.exports = TableReporter;
