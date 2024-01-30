import { decorators } from "@zombienet/utils";

export const checkNodeVersion = () => {
  const nodeVersion = process.versions.node;
  const requiredNodeVersion = getPackageNodeVersion();
  if (parseInt(nodeVersion.split(".")[0]) < parseInt(requiredNodeVersion.split(".")[0]) ) {
    console.error(
      `\n${decorators.red(
        "Error: ",
      )} \t ${decorators.bright(
        `Node version ${nodeVersion} is not supported. Please update to Node ${requiredNodeVersion} or above.`,
      )}\n`,
    );
    process.exit(1);
  }
};

const getPackageNodeVersion = () => {
  const { engines: {node}  } = require("../package.json");
  return node.replace(/>=\s*/, "");
}
