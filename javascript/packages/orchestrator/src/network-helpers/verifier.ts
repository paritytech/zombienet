import { series } from "@zombienet/utils";
import { getProcessStartTimeKey } from "../metrics";
import { Network } from "../network";
import { NetworkNode } from "../networkNode";
import { decorate } from "../paras-decorators";

const debug = require("debug")("zombie::helper::verifier");

// Verify that the nodes of the supplied network are up/running.
// To verify that the node is running we use the startProcessTime from
// prometheus server exposed in each node.
// NOTE: some parachains chain the default prefix `substrate`, that why
// we use the `para decorator` here to allow them to set the correct key
// to check.
// IFF one of the nodes is `down` just throw an error to stop the spawn
// process.
// Also, worth noting that we are checking the nodes in `batches` of 10
// at the moment. This value should work ok but we can also optimize later.
export async function verifyNodes(network: Network) {
  // wait until all the node's are up
  const nodeChecker = async (node: NetworkNode) => {
    const metricToQuery = node.para
      ? decorate(node.para, [getProcessStartTimeKey])[0]()
      : getProcessStartTimeKey(node.prometheusPrefix);
    debug(
      `\t checking node: ${node.name} with prometheusUri: ${node.prometheusUri} - key: ${metricToQuery}`,
    );
    const ready = await node.getMetric(metricToQuery, "isAtLeast", 1, 60 * 5);
    debug(`\t ${node.name} ready ${ready}`);
    return ready;
  };
  const nodeCheckGenerators = Object.values(network.nodesByName).map(
    (node: NetworkNode) => {
      return () => nodeChecker(node);
    },
  );

  const nodesOk = await series(nodeCheckGenerators, 10);
  if (!(nodesOk as any[]).every(Boolean))
    throw new Error("At least one of the nodes fails to start");
  debug("All nodes checked ok");
}
