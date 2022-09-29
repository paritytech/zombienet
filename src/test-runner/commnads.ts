const chai = require("chai");

import { BackchannelMap } from ".";
import { Network } from "../network";
import { FnArgs } from "../types";
import { sleep } from "../utils/misc";

const { expect } = chai;

const Pause = (args: FnArgs) => {
  const {node_name} = args;
  return async (network: Network, backchannelMap: BackchannelMap) => {
    const nodes = network.getNodes(node_name!);
    const results = await Promise.all(nodes.map((node) => node.pause()));

    for (const value of results) {
      expect(value).to.be.ok;
    }
  };
}

const Resume = (args: FnArgs) => {
  const {node_name} = args;
  return async (network: Network, backchannelMap: BackchannelMap) => {
    const nodes = network.getNodes(node_name!);
    const results = await Promise.all(nodes.map((node) => node.resume()));

    for (const value of results) {
      expect(value).to.be.ok;
    }
  };

}
const Restart = (args: FnArgs) => {
  const {node_name, timeout} = args;
  return async (network: Network, backchannelMap: BackchannelMap) => {
    const nodes = network.getNodes(node_name!);
    const results = await Promise.all(
      nodes.map((node) => node.restart(timeout)),
    );

    for (const value of results) {
      expect(value).to.be.ok;
    }
  };
}
const Sleep = (args: FnArgs) => {
  const {timeout} = args;
  return async () => {
    await sleep(timeout! * 1000);
    expect(true).to.be.ok;
  };
}

export default {
    Pause,
    Restart,
    Resume,
    Sleep
}