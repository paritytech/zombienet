import Mocha from "mocha";

import { decorators } from "../utils/colors";
import { CreateLogTable } from "../utils/tableCli";

const { EVENT_RUN_END, EVENT_TEST_FAIL, EVENT_TEST_PASS, EVENT_RUN_BEGIN } =
  Mocha.Runner.constants;

interface TestReporterProps {
  runner: Mocha.Runner;
  stats: Mocha.Stats;
  on: any;
  once: any;
}

class TestReporter {
  constructor(runner: TestReporterProps) {
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

        let announcement = new CreateLogTable({
          colWidths: [120],
        });
        announcement.pushToPrint([
          [
            decorators.green(
              "🛎️ Tests are currently running. Results will appear at the end",
            ),
          ],
        ]);
    runner
      .once(EVENT_RUN_BEGIN, () => {
        announcement.print();
      })
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

module.exports = TestReporter;
