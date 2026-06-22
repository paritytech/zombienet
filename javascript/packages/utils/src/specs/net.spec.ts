import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";

import { assert } from "chai";
import { downloadFile } from "../net";

describe("Tests on module 'net';", () => {
  const tmpDir = path.join(__dirname, "tmp_net_tests");

  before(function () {
    mkdirSync(tmpDir, { recursive: true });
  });

  after(function () {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("downloadFile copies from a file:// source", async () => {
    const src = path.join(tmpDir, "source.txt");
    const dest = path.join(tmpDir, "dest.txt");
    const contents = "zombienet db snapshot";
    writeFileSync(src, contents);

    await downloadFile(pathToFileURL(src).toString(), dest);

    assert.equal(readFileSync(dest, "utf8"), contents);
  });
});
