import { mkdir, readFile, rmSync } from "fs";
import path from "path";

import chai, { assert, expect } from "chai";
import deepEqualInAnyOrder from "deep-equal-in-any-order";
import { readNetworkConfig, writeLocalJsonFile } from "../fs";
import { LaunchConfig } from "../types";

chai.use(deepEqualInAnyOrder);

describe("Tests on module 'fs';", () => {
  before(async function () {
    await mkdir(path.join(__dirname, "tmp_tests"), (err) => {
      if (err) {
        return console.error(err);
      }
    });
  });

  after(async function () {
    rmSync(path.join(__dirname, "tmp_tests"), { recursive: true, force: true });
  });

  it("tests that fs/writeLocalJsonFile is success ", async () => {
    const jsonTest = {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        name: "this.namespace",
      },
    };

    const writeFn = () =>
      writeLocalJsonFile(
        path.join(__dirname, "tmp_tests"),
        "writeLocalJsonFile.json",
        jsonTest,
      );

    expect(writeFn).to.not.throw();

    readFile(
      path.join(__dirname, "tmp_tests", "writeLocalJsonFile.json"),
      "utf8",
      (err, data) => {
        if (err) {
          console.error(err);
        } else {
          expect(JSON.parse(data)).to.deep.equalInAnyOrder(jsonTest);
        }
      },
    );
  });

  it("tests that fs/readNetworkConfig converts the config file", async () => {
    const some = path.resolve(path.join(__dirname, "./spec-config.toml"));
    const s: LaunchConfig = readNetworkConfig(some);
    assert.equal(s?.relaychain?.default_image, "test-image");
    assert.equal(s?.relaychain?.default_command, "test-polkadot");
    if (s?.relaychain?.default_args) {
      const arg = s?.relaychain?.default_args[0];
      assert.equal(arg, "-lparachain=test");
    }
    assert.equal(s?.relaychain?.chain, "test-rococo");
    const node = s?.relaychain?.nodes && s?.relaychain?.nodes[0];
    assert.notEqual(node, undefined);
    node && assert.equal(node.name, "alice");

    assert.equal(s?.relaychain?.default_command, "test-polkadot");
  });
});
