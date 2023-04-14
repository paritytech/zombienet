import chai, { assert } from "chai";
import chaiAsPromised from "chai-as-promised";
import { describe } from "mocha";
import { generateNodeMultiAddress } from "../bootnode";
chai.use(chaiAsPromised);

describe("Test generaeteNodeMultiAddress:", () => {
  it("without --listen-addr - success", async () => {
    const check = await generateNodeMultiAddress(
      "2bd806c97f0e00af1a1fc3328fa763a9269723c8db8fac4f93af71db186d6e90",
      ["-lparachain=debug"],
      "127.0.0.1",
      38135,
    );

    assert.equal(
      check,
      "/ip4/127.0.0.1/tcp/38135/ws/p2p/12D3KooWQCkBm1BYtkHpocxCwMgR8yjitEeHGx8spzcDLGt2gkBm",
    );
  });

  it("with --listen-addr - success", async () => {
    const check = await generateNodeMultiAddress(
      "2bd806c97f0e00af1a1fc3328fa763a9269723c8db8fac4f93af71db186d6e90",
      ["-lparachain=debug", "--listen-addr", "/ip4/10.0.0.2/tcp/30333"],
      "10.0.0.2",
      30333,
    );

    assert.equal(
      check,
      "/ip4/10.0.0.2/tcp/30333/ws/p2p/12D3KooWQCkBm1BYtkHpocxCwMgR8yjitEeHGx8spzcDLGt2gkBm",
    );
  });

  it("with ws=false - success", async () => {
    const check = await generateNodeMultiAddress(
      "2bd806c97f0e00af1a1fc3328fa763a9269723c8db8fac4f93af71db186d6e90",
      ["-lparachain=debug", "--listen-addr", "/ip4/10.0.0.2/tcp/30333"],
      "10.0.0.2",
      30333,
      false,
    );

    assert.equal(
      check,
      "/ip4/10.0.0.2/tcp/30333/p2p/12D3KooWQCkBm1BYtkHpocxCwMgR8yjitEeHGx8spzcDLGt2gkBm",
    );
  });

  it("with wrong address in --listen-addr - throw Error", async () => {
    return assert.isRejected(
      generateNodeMultiAddress(
        "2bd806c97f0e00af1a1fc3328fa763a9269723c8db8fac4f93af71db186d6e90",
        ["-lparachain=debug", "--listen-addr", "/ip4/10.0.0.2/30333"],
        "10.0.0.2",
        30333,
      ),
      Error,
      "Provided address is not well formatted",
    );
  });
});
