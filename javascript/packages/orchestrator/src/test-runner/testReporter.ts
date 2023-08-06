import Mocha from "mocha";

import { CreateLogTable, decorators } from "@zombienet/utils";

const { EVENT_RUN_END, EVENT_TEST_FAIL, EVENT_TEST_PASS, EVENT_TEST_BEGIN } =
  Mocha.Runner.constants;

interface TestReporterProps {
  runner: Mocha.Runner;
  stats: Mocha.Stats;
  on: any;
  once: any;
}

let bannerPrinted = false;

class TestReporter {
  constructor(runner: TestReporterProps) {
    const stats = runner.stats!;

    const logTableInit = new CreateLogTable({
      head: [
        {
          colSpan: 2,
          hAlign: "center",
          content: decorators.green("Test Results"),
        },
      ],
      colWidths: [30, 100],
    });

    const logTable = new CreateLogTable({
      colWidths: [30, 100],
    });

    const announcement = new CreateLogTable({
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
      .once(EVENT_TEST_BEGIN, () => {
        announcement.print();
      })
      .on(EVENT_TEST_BEGIN, () => {
        if (!bannerPrinted) logTableInit.print();
        bannerPrinted = true;
      })
      .on(EVENT_TEST_PASS, (test: Mocha.Test) => {
        new CreateLogTable({
          colWidths: [30, 100],
        }).pushToPrint([
          [
            new Date().toLocaleString(),
            `✅ ${test.title} ${decorators.underscore(`(${test.duration}ms)`)}`,
          ],
        ]);
      })
      .on(EVENT_TEST_FAIL, (test: Mocha.Test) => {
        new CreateLogTable({
          colWidths: [30, 100],
        }).pushToPrint([
          [
            new Date().toLocaleString(),
            `❌ ${test.title} ${decorators.underscore(`(${test.duration}ms)`)}`,
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
