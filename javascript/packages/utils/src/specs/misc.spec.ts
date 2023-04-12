import { sleep } from "@zombienet/utils";
import { assert } from "chai";

describe("Tests on module 'misc';", () => {
  it("test fn: sleep", async () => {
    let timeBeforeSleep = new Date().getTime();
    await sleep(2 * 10);
    let timeAfterSleep = new Date().getTime();
    assert.isTrue(
      timeAfterSleep - timeBeforeSleep >= 20 &&
        timeAfterSleep - timeBeforeSleep < 24,
    );

    timeBeforeSleep = new Date().getTime();
    await sleep(2 * 13);
    timeAfterSleep = new Date().getTime();

    assert.isTrue(
      timeAfterSleep - timeBeforeSleep >= 26 &&
        timeAfterSleep - timeBeforeSleep < 29,
    );
  });

  // THROWS error
  // it("test fn: retry", async () => {
  //   await expect(() =>
  //     retry(30, 300, async () => false, "An error happened"),
  //   ).to.throw("Timeout(0) for: An error happened");
  // });

  // it("test fn: generateNamespace", () => {});
  // it("test fn: getSha256", () => {});
  // it("test fn: addMinutes", () => {});
  // it("test fn: convertBytes", () => {});
  // it("test fn: isValidHttpUrl", () => {});
  // it("test fn: filterConsole", () => {});
  // it("test fn: convertExponentials", () => {});
  // it("test fn: getLokiUrl", () => {});
  // it("test fn: getRandom", () => {});
  // it("test fn: getFilePathNameExt", () => {});
  // it("test fn: validateImageUrl", () => {});
});
