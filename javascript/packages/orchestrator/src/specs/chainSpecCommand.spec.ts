import { expect } from "chai";
import {
  chainSpecBuilderPrefix,
  defaultChainSpecCommand,
  detectChainSpecCommand,
  listSubcommands,
  plainChainSpecCommand,
  rawChainSpecCommand,
  resolveChainSpecSubcommand,
  withChainArg,
} from "../chainSpecCommand";

// Trimmed `--help` of polkadot-stable2609-2.
const POLKADOT_HELP = `Usage: polkadot [OPTIONS] [COMMAND]

Commands:
  build-spec         Build a chain specification. DEPRECATED: \`build-spec\` command will be removed
                     after 1/04/2026. Use \`export-chain-spec\` command instead
  export-chain-spec  Export the chain specification
  check-block        Validate blocks
  key                Key management CLI utilities
  help               Print this message or the help of the given subcommand(s)

Options:
      --chain <CHAIN_SPEC>
          It can be one of the predefined ones (dev, local, or staging) or it can be a path to a
          file with the chainspec (such as one exported by the \`build-spec\` subcommand).
`;

// Trimmed `--help` of polkadot-omni-node from polkadot-stable2609-2.
const OMNI_NODE_HELP = `Usage: polkadot-omni-node [OPTIONS] [-- <RELAY_CHAIN_ARGS>...] [COMMAND]

Commands:
  key                  Key management CLI utilities
  build-spec           Build a chain specification
  check-block          Validate blocks
  chain-spec-builder   Subcommand for generating and managing chain specifications
  export-genesis-head  Export the genesis state of the parachain
  export-genesis-wasm  Export the genesis wasm of the parachain
  benchmark            Sub-commands concerned with benchmarking. The pallet benchmarking moved to
                       the \`pallet\` sub-command
  help                 Print this message or the help of the given subcommand(s)
`;

// Nodes without `build-spec`.
const POLKADOT_HELP_NO_BUILD_SPEC = `Commands:
  export-chain-spec  Export the chain specification
  check-block        Validate blocks
  help               Print this message or the help of the given subcommand(s)
`;

const OMNI_NODE_HELP_NO_BUILD_SPEC = `Commands:
  key                  Key management CLI utilities
  check-block          Validate blocks
  chain-spec-builder   Subcommand for generating and managing chain specifications
  export-genesis-head  Export the genesis state of the parachain
  help                 Print this message or the help of the given subcommand(s)
`;

const POLKADOT_PARACHAIN_HELP = `Commands:
  key                  Key management CLI utilities
  chain-spec-builder   Subcommand for generating and managing chain specifications
  export-genesis-head  Export the genesis state of the parachain
  export-chain-spec    Export the chain specification
  help                 Print this message or the help of the given subcommand(s)
`;

// clap 3 layout used by older nodes.
const LEGACY_HELP = `USAGE:
    polkadot [OPTIONS] [SUBCOMMAND]

OPTIONS:
        --chain <CHAIN_SPEC>    Specify the chain specification

SUBCOMMANDS:
    benchmark      Sub-commands concerned with benchmarking
    build-spec     Build a chain specification
    check-block    Validate blocks
    help           Print this message or the help of the given subcommand(s)
`;

const NO_CHAIN_SPEC_HELP = `Commands:
  check-block  Validate blocks. See \`build-spec\` and \`export-chain-spec\`
               to export a chain-spec
  help         Print this message or the help of the given subcommand(s)

Options:
      --chain <CHAIN_SPEC>
          file with the chainspec (such as one exported by the \`build-spec\` subcommand).
`;

// A shell wrapper calling chain-spec-builder itself.
const BUILDER_SHELL_WRAPPER = `bash -c 'polkadot-omni-node chain-spec-builder -c /dev/stdout convert-to-raw "$1"' _ {{chainName}}`;

describe("chainSpecCommand", () => {
  describe("listSubcommands", () => {
    it("skips wrapped descriptions and other sections", () => {
      expect(listSubcommands(POLKADOT_HELP)).to.deep.equal([
        "build-spec",
        "export-chain-spec",
        "check-block",
        "key",
        "help",
      ]);
    });

    it("reads the legacy SUBCOMMANDS section", () => {
      expect(listSubcommands(LEGACY_HELP)).to.deep.equal([
        "benchmark",
        "build-spec",
        "check-block",
        "help",
      ]);
    });

    it("returns nothing without a commands section", () => {
      expect(listSubcommands("")).to.deep.equal([]);
    });
  });

  describe("resolveChainSpecSubcommand", () => {
    it("prefers export-chain-spec", () => {
      expect(resolveChainSpecSubcommand(POLKADOT_HELP)).to.equal(
        "export-chain-spec",
      );
      expect(resolveChainSpecSubcommand(POLKADOT_PARACHAIN_HELP)).to.equal(
        "export-chain-spec",
      );
    });

    it("uses export-chain-spec on nodes without build-spec", () => {
      expect(resolveChainSpecSubcommand(POLKADOT_HELP_NO_BUILD_SPEC)).to.equal(
        "export-chain-spec",
      );
    });

    it("keeps build-spec when export-chain-spec is missing", () => {
      expect(resolveChainSpecSubcommand(OMNI_NODE_HELP)).to.equal("build-spec");
      expect(resolveChainSpecSubcommand(LEGACY_HELP)).to.equal("build-spec");
    });

    it("falls back to chain-spec-builder", () => {
      expect(resolveChainSpecSubcommand(OMNI_NODE_HELP_NO_BUILD_SPEC)).to.equal(
        "chain-spec-builder",
      );
    });

    it("ignores mentions outside the commands list", () => {
      expect(resolveChainSpecSubcommand(NO_CHAIN_SPEC_HELP)).to.be.undefined;
    });
  });

  describe("defaultChainSpecCommand", () => {
    it("builds the command for each subcommand", () => {
      expect(defaultChainSpecCommand("polkadot", "export-chain-spec")).to.equal(
        "polkadot export-chain-spec --chain {{chainName}}",
      );
      expect(defaultChainSpecCommand("polkadot", "build-spec")).to.equal(
        "polkadot build-spec --chain {{chainName}} --disable-default-bootnode",
      );
      expect(
        defaultChainSpecCommand("polkadot-omni-node", "chain-spec-builder"),
      ).to.equal("polkadot-omni-node chain-spec-builder");
    });

    it("omits --chain when asked", () => {
      expect(
        defaultChainSpecCommand(
          "polkadot-parachain",
          "export-chain-spec",
          false,
        ),
      ).to.equal("polkadot-parachain export-chain-spec");
      expect(
        defaultChainSpecCommand("polkadot-parachain", "build-spec", false),
      ).to.equal("polkadot-parachain build-spec --disable-default-bootnode");
    });
  });

  describe("detectChainSpecCommand", () => {
    it("asks the binary for its help", async () => {
      const calls: string[][] = [];
      const command = await detectChainSpecCommand(
        async (image, binary) => {
          calls.push([image, binary]);
          return OMNI_NODE_HELP_NO_BUILD_SPEC;
        },
        "omni-image",
        "polkadot-omni-node",
      );
      expect(calls).to.deep.equal([["omni-image", "polkadot-omni-node"]]);
      expect(command).to.equal("polkadot-omni-node chain-spec-builder");
    });

    it("passes withChain through", async () => {
      const command = await detectChainSpecCommand(
        async () => POLKADOT_PARACHAIN_HELP,
        "image",
        "polkadot-parachain",
        false,
      );
      expect(command).to.equal("polkadot-parachain export-chain-spec");
    });

    it("keeps the current command if the help can't be read", async () => {
      const command = await detectChainSpecCommand(
        async () => "",
        "image",
        "polkadot",
      );
      expect(command).to.be.undefined;
    });

    it("keeps the current command if no chain-spec subcommand is listed", async () => {
      const command = await detectChainSpecCommand(
        async () => NO_CHAIN_SPEC_HELP,
        "image",
        "my-node",
      );
      expect(command).to.be.undefined;
    });
  });

  describe("chainSpecBuilderPrefix", () => {
    it("finds the subcommand", () => {
      expect(
        chainSpecBuilderPrefix("/bins/polkadot-omni-node chain-spec-builder"),
      ).to.equal("/bins/polkadot-omni-node chain-spec-builder");
    });

    it("finds the standalone binary and drops its arguments", () => {
      expect(
        chainSpecBuilderPrefix(
          "/bins/chain-spec-builder -c {{outputPath}} create -r runtime.wasm default",
        ),
      ).to.equal("/bins/chain-spec-builder");
    });

    it("ignores other commands", () => {
      expect(
        chainSpecBuilderPrefix(
          "polkadot export-chain-spec --chain {{chainName}}",
        ),
      ).to.be.undefined;
      expect(chainSpecBuilderPrefix("./chain-spec-generator {{chainName}}")).to
        .be.undefined;
    });

    it("ignores chain-spec-builder used inside another command", () => {
      expect(chainSpecBuilderPrefix(BUILDER_SHELL_WRAPPER)).to.be.undefined;
    });
  });

  describe("withChainArg", () => {
    it("adds --chain to build-spec and export-chain-spec", () => {
      expect(
        withChainArg(
          "polkadot-parachain build-spec --disable-default-bootnode",
        ),
      ).to.equal(
        "polkadot-parachain build-spec --disable-default-bootnode --chain {{chainName}}",
      );
      expect(withChainArg("polkadot-parachain export-chain-spec")).to.equal(
        "polkadot-parachain export-chain-spec --chain {{chainName}}",
      );
    });

    it("leaves other commands alone", () => {
      const commands = [
        "polkadot export-chain-spec --chain {{chainName}}",
        "./chain-spec-generator {{chainName}}",
        "polkadot-omni-node chain-spec-builder",
      ];
      for (const command of commands)
        expect(withChainArg(command)).to.equal(command);
    });
  });

  describe("plainChainSpecCommand", () => {
    it("redirects the output", () => {
      expect(
        plainChainSpecCommand(
          "polkadot export-chain-spec --chain {{chainName}}",
          "rococo-local",
          "/cfg/rococo-local-plain.json",
        ),
      ).to.equal(
        "polkadot export-chain-spec --chain rococo-local > /cfg/rococo-local-plain.json",
      );
    });

    it("fills {{outputPath}} instead of redirecting", () => {
      expect(
        plainChainSpecCommand(
          "chain-spec-builder -c {{outputPath}} create -r runtime.wasm named-preset {{chainName}}",
          "local_testnet",
          "/cfg/para-plain.json",
        ),
      ).to.equal(
        "chain-spec-builder -c /cfg/para-plain.json create -r runtime.wasm named-preset local_testnet",
      );
    });

    it("rejects chain-spec-builder without {{outputPath}}", () => {
      expect(() =>
        plainChainSpecCommand(
          "polkadot-omni-node chain-spec-builder",
          "para",
          "/cfg/para-plain.json",
        ),
      ).to.throw("-c {{outputPath}}");
    });
  });

  describe("rawChainSpecCommand", () => {
    it("appends --raw and redirects the output", () => {
      expect(
        rawChainSpecCommand(
          "polkadot export-chain-spec --chain {{chainName}}",
          "/cfg/plain.json",
          "/cfg/raw.json",
        ),
      ).to.equal(
        "polkadot export-chain-spec --chain /cfg/plain.json --raw > /cfg/raw.json",
      );
      expect(
        rawChainSpecCommand(
          "polkadot build-spec --chain {{chainName}} --disable-default-bootnode",
          "/cfg/plain.json",
          "/cfg/raw.json",
        ),
      ).to.equal(
        "polkadot build-spec --chain /cfg/plain.json --disable-default-bootnode --raw > /cfg/raw.json",
      );
    });

    it("converts with chain-spec-builder", () => {
      const expected =
        "/bins/polkadot-omni-node chain-spec-builder -c /cfg/raw.json convert-to-raw /cfg/plain.json";
      expect(
        rawChainSpecCommand(
          "/bins/polkadot-omni-node chain-spec-builder",
          "/cfg/plain.json",
          "/cfg/raw.json",
        ),
      ).to.equal(expected);
      expect(
        rawChainSpecCommand(
          "/bins/polkadot-omni-node chain-spec-builder -c {{outputPath}} create -r runtime.wasm default",
          "/cfg/plain.json",
          "/cfg/raw.json",
        ),
      ).to.equal(expected);
    });

    it("keeps shell wrappers around chain-spec-builder working", () => {
      expect(
        rawChainSpecCommand(
          BUILDER_SHELL_WRAPPER,
          "/cfg/plain.json",
          "/cfg/raw.json",
        ),
      ).to.equal(
        `bash -c 'polkadot-omni-node chain-spec-builder -c /dev/stdout convert-to-raw "$1"' _ /cfg/plain.json --raw > /cfg/raw.json`,
      );
    });

    it("fills {{outputPath}} instead of redirecting", () => {
      expect(
        rawChainSpecCommand(
          "generator --out {{outputPath}} --chain {{chainName}}",
          "/cfg/plain.json",
          "/cfg/raw.json",
        ),
      ).to.equal("generator --out /cfg/raw.json --chain /cfg/plain.json --raw");
    });
  });
});
