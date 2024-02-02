import { getClient } from "../client";

export const getCliArgsHelp = async (
  image: string,
  command: string,
): Promise<string> => {
  const client = getClient();
  const fullCmd = `${command} --help`;
  const logs = (await client.runCommand(["-c", fullCmd], { allowFail: true }))
    .stdout;

  return logs;
};
