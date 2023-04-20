import chai, { assert, expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import { describe } from "mocha";
import { copyFile, unlink } from "node:fs/promises";
import path from "path";

import {
  fakeGenesisKey,
  fakeNode,
  fakeSession,
  kusamaPath,
  stringifyBigInt,
} from "./testHelper";

import {
  clearAuthorities,
  getNodeKey,
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

  it("getNodeKey - success", async () => {
    const key = getNodeKey(JSON.parse(fakeNode));
    assert.equal(key[0], fakeGenesisKey[0]);
    assert.equal(key[1], fakeGenesisKey[1]);
    assert.equal(key[2].grandpa, fakeGenesisKey[2].grandpa);
    assert.equal(key[2].babe, fakeGenesisKey[2].babe);
    assert.equal(key[2].im_online, fakeGenesisKey[2].im_online);
    assert.equal(
      key[2].parachain_validator,
      fakeGenesisKey[2].parachain_validator,
    );
    assert.equal(
      key[2].authority_discovery,
      fakeGenesisKey[2].authority_discovery,
    );
    assert.equal(key[2].para_validator, fakeGenesisKey[2].para_validator);
    assert.equal(key[2].para_assignment, fakeGenesisKey[2].para_assignment);
    assert.equal(key[2].beefy, fakeGenesisKey[2].beefy);
    assert.equal(key[2].aura, fakeGenesisKey[2].aura);
  });

  // it("addAuthority", () => {});
  // it("...", () => {});
  // it("...", () => {});
});
