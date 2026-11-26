import { decorators } from "@zombienet/utils";

const debug = require("debug")("zombie::chain-spec-command");

// In order of preference. `chain-spec-builder` can only convert an existing spec.
const CHAIN_SPEC_SUBCOMMANDS = [
  "export-chain-spec",
  "build-spec",
  "chain-spec-builder",
] as const;

export type ChainSpecSubcommand = (typeof CHAIN_SPEC_SUBCOMMANDS)[number];

// Subcommands listed in the `Commands:` (or legacy `SUBCOMMANDS:`) section of `--help`.
export function listSubcommands(helpText: string): string[] {
  const lines = helpText.split(/\r?\n/);
  const header = lines.findIndex((line) =>
    /^(Commands|SUBCOMMANDS):$/.test(line.trim()),
  );
  if (header === -1) return [];

  const subcommands: string[] = [];
  let indent: number | undefined;
  for (const line of lines.slice(header + 1)) {
    if (!line.trim()) break;
    const lineIndent = line.length - line.trimStart().length;
    indent ??= lineIndent;
    if (lineIndent < indent) break;
    // deeper indentation is a wrapped description
    if (lineIndent > indent) continue;
    subcommands.push(line.trim().split(/\s+/)[0]);
  }

  return subcommands;
}

export function resolveChainSpecSubcommand(
  helpText: string,
): ChainSpecSubcommand | undefined {
  const subcommands = listSubcommands(helpText);
  return CHAIN_SPEC_SUBCOMMANDS.find((s) => subcommands.includes(s));
}

export function defaultChainSpecCommand(
  binary: string,
  subcommand: ChainSpecSubcommand,
  withChain = true,
): string {
  const chain = withChain ? " --chain {{chainName}}" : "";
  switch (subcommand) {
    case "export-chain-spec":
      return `${binary} export-chain-spec${chain}`;
    case "build-spec":
      return `${binary} build-spec${chain} --disable-default-bootnode`;
    case "chain-spec-builder":
      return `${binary} chain-spec-builder`;
  }
}

// Picks the default chain-spec command from the binary's `--help`. Returns
// undefined if none is found, so the caller keeps its current command.
export async function detectChainSpecCommand(
  getCliArgsHelp: (image: string, command: string) => Promise<string>,
  image: string,
  binary: string,
  withChain = true,
): Promise<string | undefined> {
  const helpText = await getCliArgsHelp(image, binary);
  if (!listSubcommands(helpText).length) {
    debug(`can't read the subcommands of ${binary}, keeping the default`);
    return;
  }

  const subcommand = resolveChainSpecSubcommand(helpText);
  if (!subcommand) {
    console.log(
      decorators.yellow(
        `\t⚠️ ${binary} lists none of ${CHAIN_SPEC_SUBCOMMANDS.join(", ")}; set \`chain_spec_command\` if a chain spec has to be generated`,
      ),
    );
    return;
  }

  debug(`using ${subcommand} for ${binary}`);
  return defaultChainSpecCommand(binary, subcommand, withChain);
}

// `chain-spec-builder` as the command itself or as its subcommand: the words up to it.
export function chainSpecBuilderPrefix(cmd: string): string | undefined {
  const [command, subcommand] = cmd.split(" ").filter(Boolean);
  if (
    command === "chain-spec-builder" ||
    command?.endsWith("/chain-spec-builder")
  )
    return command;
  if (subcommand === "chain-spec-builder") return `${command} ${subcommand}`;
}

// Pass the plain spec to `build-spec` / `export-chain-spec` commands without `--chain`.
export function withChainArg(cmd: string): string {
  const parts = cmd.split(" ").filter(Boolean);
  const needsChain =
    (parts.includes("build-spec") || parts.includes("export-chain-spec")) &&
    !parts.includes("--chain");
  return needsChain ? `${cmd} --chain {{chainName}}` : cmd;
}

// Shell command writing the plain chain-spec of `chainName` to `outputPath`.
export function plainChainSpecCommand(
  cmd: string,
  chainName: string,
  outputPath: string,
): string {
  const withChain = cmd.replace(/{{chainName}}/gi, chainName);
  if (/{{outputPath}}/i.test(cmd))
    return withChain.replace(/{{outputPath}}/gi, outputPath);

  if (chainSpecBuilderPrefix(cmd))
    throw new Error(
      `chain-spec-builder can only create a chain-spec with \`-c {{outputPath}}\`, or set \`chain_spec_path\` (command: ${cmd})`,
    );

  return `${withChain} > ${outputPath}`;
}

// Shell command converting the plain chain-spec at `plainPath` to raw, written to `rawPath`.
export function rawChainSpecCommand(
  cmd: string,
  plainPath: string,
  rawPath: string,
): string {
  const builder = chainSpecBuilderPrefix(cmd);
  if (builder) return `${builder} -c ${rawPath} convert-to-raw ${plainPath}`;

  const withChain = cmd.replace(/{{chainName}}/gi, plainPath);
  if (/{{outputPath}}/i.test(cmd))
    return `${withChain.replace(/{{outputPath}}/gi, rawPath)} --raw`;

  return `${withChain} --raw > ${rawPath}`;
}
