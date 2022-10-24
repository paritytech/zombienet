const chai = require("chai");

import { sleep } from "@zombienet/utils";
import { BackchannelMap } from ".";
import { Network } from "../network";
import { FnArgs } from "../types";

const { expect } = chai;

const Pause = ({ node_name }: FnArgs) => {
  return async (network: Network, backchannelMap: BackchannelMap) => {
    const nodes = network.getNodes(node_name!);
    const results = await Promise.all(nodes.map((node: any) => node.pause()));

    for (const value of results) {
      expect(value).to.be.ok;
    }
  };
};

const Resume = ({ node_name }: FnArgs) => {
  return async (network: Network, backchannelMap: BackchannelMap) => {
    const nodes = network.getNodes(node_name!);
    const results = await Promise.all(nodes.map((node: any) => node.resume()));

    for (const value of results) {
      expect(value).to.be.ok;
    }
  };
};
const Restart = ({ node_name, after }: FnArgs) => {
  after = after || 5; // at least 1 seconds
  return async (network: Network, backchannelMap: BackchannelMap) => {
    const nodes = network.getNodes(node_name!);
    const results = await Promise.all(
      nodes.map((node: any) => node.restart(after)),
    );

    for (const value of results) {
      expect(value).to.be.ok;
    }
  };
};
const Sleep = ({ seconds }: FnArgs) => {
  seconds = seconds || 1;
  return async () => {
    await sleep(seconds! * 1000);
    expect(true).to.be.ok;
  };
};

export default {
  Pause,
  Restart,
  Resume,
  Sleep,
};
