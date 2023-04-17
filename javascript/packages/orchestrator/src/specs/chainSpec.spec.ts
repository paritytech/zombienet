import chai, { assert, expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import { describe } from "mocha";
import { copyFile, unlink } from "node:fs/promises";
import path from "path";

import { fakeSession, kusamaPath, stringifyBigInt } from "./testHelper";

import {
  clearAuthorities,
  getRuntimeConfig,
  readAndParseChainSpec,
} from "../chainSpec";
chai.use(chaiAsPromised);

describe("Test chainspec:", () => {
  const kusamaCopiedPath = path.resolve(
    path.join(__dirname, "./kusama-clear.json"),
  );
  const ksmSpec = readAndParseChainSpec(kusamaPath);

  beforeEach(async () => {
    await copyFile(kusamaPath, kusamaCopiedPath);
  });

  afterEach(async () => {
    await unlink(kusamaCopiedPath);
  });

  it("readAndParseChainSpec - success", () => {
    expect(ksmSpec).not.to.throw;
  });

  it("getRuntimeConfig - success", () => {
    const result = getRuntimeConfig(ksmSpec);
    const runtime = ksmSpec.genesis.runtime;
    const a = stringifyBigInt(result);
    const b = stringifyBigInt(runtime);

    assert.equal(a, b);
  });

  it("specHaveSessionsKeys - success", () => {
    const { session } = ksmSpec.genesis.runtime;
    const a = stringifyBigInt(session);
    const b = stringifyBigInt(fakeSession);
    assert.equal(a, b);
  });

  it("clearAuthorities - success", async () => {
    await clearAuthorities(kusamaCopiedPath);
    const cleared = readAndParseChainSpec(kusamaCopiedPath);
    assert.equal(cleared.genesis.runtime.session.keys.length, 0);
    assert.equal(cleared.genesis.runtime.grandpa.authorities.length, 0);
    assert.equal(cleared.genesis.runtime.session.keys.length, 0);

    assert.notEqual(
      ksmSpec.genesis.runtime.staking.stakers.length,
      cleared.genesis.runtime.staking.stakers.length,
    );
    assert.notEqual(
      ksmSpec.genesis.runtime.staking.invulnerables.length,
      cleared.genesis.runtime.staking.invulnerables.length,
    );
    assert.notEqual(
      ksmSpec.genesis.runtime.staking.validatorCount,
      cleared.genesis.runtime.staking.validatorCount,
    );
    assert.equal(cleared.genesis.runtime.staking.stakers.length, 0);
    assert.equal(cleared.genesis.runtime.staking.invulnerables.length, 0);
    assert.equal(cleared.genesis.runtime.staking.validatorCount, 0);
  });

  // it("addBalances - success", async () => {
  //   await addBalances(kusamaCopiedPath, [JSON.parse(fakeNode)]);
  //   const addedBalance = readAndParseChainSpec(kusamaCopiedPath);
  //   console.log("-------------->", addedBalance.genesis.runtime.balances);
  // });
  // it("...", () => {});
  // it("...", () => {});
});
