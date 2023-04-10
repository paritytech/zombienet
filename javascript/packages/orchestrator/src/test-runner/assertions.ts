import { ApiPromise, Keyring } from "@polkadot/api";
import { decorators, isValidHttpUrl } from "@zombienet/utils";
import { assert, expect } from "chai";
import { JSDOM } from "jsdom";
import { makeRe } from "minimatch";
import path from "path";
import { BackchannelMap } from ".";
import {
  chainCustomSectionUpgrade,
  chainUpgradeFromLocalFile,
  chainUpgradeFromUrl,
  connect,
  findPatternInSystemEventSubscription,
  registerParachain,
  validateRuntimeCode,
} from "../jsapi-helpers";
import { Network } from "../network";
import { FnArgs } from "../types";
const utilCrypto = require("@polkadot/util-crypto");

const DEFAULT_INDIVIDUAL_TEST_TIMEOUT = 10; // seconds

// helper
function toChaiComparator(op: string): string {
  return op.charAt(0).toLocaleLowerCase() + op.slice(1);
}

const comparators: { [key: string]: Function } = {
  Equal: assert.equal,
  NotEqual: assert.notEqual,
  IsAbove: assert.isAbove,
  IsAtLeast: assert.isAtLeast,
  IsBelow: assert.isBelow,
  IsAtMost: assert.isAtMost,
};

const IsUp = ({ node_name, timeout }: FnArgs) => {
  timeout = timeout || DEFAULT_INDIVIDUAL_TEST_TIMEOUT;
  return async (network: Network) => {
    const nodes = network.getNodes(node_name!);
    const results = await Promise.all(
      nodes.map((node: any) =>
        node.getMetric("process_start_time_seconds", "isAtLeast", 1, timeout),
      ),
    );
    const AllNodeUps = results.every(Boolean);
    expect(AllNodeUps).to.be.ok;
  };
};

const Report = ({
  node_name,
  metric_name,
  target_value,
  op,
  timeout,
}: FnArgs) => {
  const comparatorFn = comparators[op!];
  return async (network: Network) => {
    const nodes = network.getNodes(node_name!);
    const results = await Promise.all(
      nodes.map((node: any) =>
        node.getMetric(
          metric_name!,
          toChaiComparator(op!),
          target_value!,
          timeout || DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
        ),
      ),
    );

    for (const value of results) {
      comparatorFn(value as number, target_value as number);
    }
  };
};

const Histogram = ({
  node_name,
  metric_name,
  target_value,
  buckets,
  op,
  timeout,
}: FnArgs) => {
  const comparatorFn = comparators[op!];
  return async (network: Network) => {
    const nodes = network.getNodes(node_name!);
    const results = await Promise.all(
      nodes.map((node: any) =>
        node.getHistogramSamplesInBuckets(
          metric_name!,
          buckets!,
          target_value!,
          timeout || DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
        ),
      ),
    );

    for (const value of results) {
      comparatorFn(value, target_value);
    }
  };
};

const Trace = ({ node_name, span_id, pattern }: FnArgs) => {
  const spanNames = pattern!
    .split(",")
    .map((x) => x.replaceAll('"', "").trim());
  return async (network: Network) => {
    const nodes = network.getNodes(node_name!);
    const results = await Promise.all(
      nodes.map((node: any) =>
        node.getSpansByTraceId(span_id!, network.tracing_collator_url!),
      ),
    );

    for (const value of results) {
      assert.includeOrderedMembers(value, spanNames);
    }
  };
};

const LogMatch = ({ node_name, pattern, match_type, timeout }: FnArgs) => {
  const isGlob = (match_type && match_type.trim() === "glob") || false;

  return async (network: Network) => {
    const nodes = network.getNodes(node_name!);
    const results = await Promise.all(
      nodes.map((node: any) => node.findPattern(pattern!, isGlob, timeout)),
    );

    const found = results.every(Boolean);
    expect(found).to.be.ok;
  };
};

const CountLogMatch = ({
  node_name,
  pattern,
  match_type,
  op,
  target_value,
  timeout,
}: FnArgs) => {
  const comparatorFn = comparators[op!];
  const isGlob = (match_type && match_type.trim() === "glob") || false;

  return async (network: Network) => {
    const nodes = network.getNodes(node_name!);
    const results = await Promise.all(
      nodes.map((node: any) =>
        node.countPatternLines(pattern!, isGlob, timeout),
      ),
    );

    for (const value of results) {
      comparatorFn(value as number, target_value as number);
    }
  };
};

const SystemEvent = ({ node_name, pattern, match_type, timeout }: FnArgs) => {
  const isGlob = (match_type && match_type.trim() === "glob") || false;

  return async (network: Network) => {
    const node = network.node(node_name!);
    const api: ApiPromise = await connect(node.wsUri);
    const re = isGlob ? makeRe(pattern!) : new RegExp(pattern!, "ig");
    const found = await findPatternInSystemEventSubscription(
      api,
      re as RegExp,
      timeout || DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
    );
    api.disconnect();

    expect(found).to.be.ok;
  };
};

// Customs
const CustomJs = ({
  node_name,
  file_path,
  custom_args,
  op,
  target_value,
  timeout,
}: FnArgs) => {
  timeout = timeout || DEFAULT_INDIVIDUAL_TEST_TIMEOUT;
  const comparatorFn = comparators[op!];

  return async (
    network: Network,
    _backchannelMap: BackchannelMap,
    configBasePath: string,
  ) => {
    const networkInfo = {
      tmpDir: network.tmpDir,
      chainSpecPath: network.chainSpecFullPath,
      relay: network.relay.map((node: any) => {
        const { name, wsUri, prometheusUri, userDefinedTypes } = node;
        return { name, wsUri, prometheusUri, userDefinedTypes };
      }),
      paras: Object.keys(network.paras).reduce((memo: any, paraId: any) => {
        const { chainSpecPath, wasmPath, statePath } = network.paras[paraId];
        memo[paraId] = { chainSpecPath, wasmPath, statePath };
        memo[paraId].nodes = network.paras[paraId].nodes.map((node) => {
          return { ...node };
        });
        return memo;
      }, {}),
      nodesByName: Object.keys(network.nodesByName).reduce(
        (memo: any, nodeName) => {
          const { name, wsUri, prometheusUri, userDefinedTypes, parachainId } =
            network.nodesByName[nodeName];
          memo[nodeName] = { name, wsUri, prometheusUri, userDefinedTypes };
          if (parachainId) memo[nodeName].parachainId = parachainId;
          return memo;
        },
        {},
      ),
    };

    const nodes = network.getNodes(node_name!);
    const call_args = custom_args
      ? custom_args === ""
        ? []
        : custom_args.split(",")
      : [];

    const resolvedJsFilePath = path.resolve(configBasePath, file_path!);

    // shim with jsdom
    const dom = new JSDOM(
      "<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>",
    );
    (global as any).window = dom.window;
    (global as any).document = dom.window.document;
    (global as any).zombie = {
      ApiPromise,
      Keyring,
      util: utilCrypto,
      connect,
      registerParachain,
    };
    const jsScript = await import(resolvedJsFilePath);

    let values;
    try {
      const resp: any = await Promise.race([
        Promise.all(
          nodes.map((node: any) =>
            jsScript.run(node.name, networkInfo, call_args),
          ),
        ),
        new Promise((resolve) =>
          setTimeout(() => {
            const err = new Error(
              `Timeout(${timeout}), "custom-js ${file_path!} within ${timeout} secs" didn't complete on time.`,
            );
            return resolve(err);
          }, timeout! * 1000),
        ),
      ]);
      if (resp instanceof Error) throw new Error(resp as any);
      else values = resp;
    } catch (err: any) {
      console.log(
        `\n ${decorators.red(
          `Error running script: ${file_path!}`,
        )} \t ${decorators.bright(err.message)}\n`,
      );
      throw new Error(err);
    }

    // remove shim
    (global as any).window = undefined;
    (global as any).document = undefined;
    (global as any).zombie = undefined;

    if (target_value) {
      for (const value of values) {
        comparatorFn(value, target_value);
      }
    } else {
      // test don't have matching output
      expect(true).to.be.ok;
    }
  };
};

const CustomSh = ({
  node_name,
  file_path,
  custom_args,
  op,
  target_value,
  timeout,
}: FnArgs) => {
  timeout = timeout || DEFAULT_INDIVIDUAL_TEST_TIMEOUT;
  const comparatorFn = comparators[op!];

  return async (
    network: Network,
    _backchannelMap: BackchannelMap,
    configBasePath: string,
  ) => {
    try {
      const resolvedShFilePath = path.resolve(configBasePath, file_path!);

      const nodes = network.getNodes(node_name!);
      const call_args = custom_args
        ? custom_args === ""
          ? []
          : custom_args.split(",")
        : [];

      const results = await Promise.all(
        nodes.map((node: any) =>
          node.run(resolvedShFilePath, call_args, timeout),
        ),
      );

      if (comparatorFn && target_value !== undefined) {
        for (const value of results) {
          comparatorFn(value, target_value);
        }
      }

      // all the commands run successfully
      expect(true).to.be.ok;
    } catch (err: any) {
      console.log(
        `\n ${decorators.red(
          `Error running script: ${file_path!}`,
        )} \t ${decorators.bright(err.message)}\n`,
      );
      throw new Error(err);
    }
  };
};

// Paras
const ParaIsRegistered = ({ node_name, para_id, timeout }: FnArgs) => {
  return async (network: Network) => {
    const nodes = network.getNodes(node_name!);
    const results = await Promise.all(
      nodes.map((node: any) => node.parachainIsRegistered(para_id!, timeout)),
    );

    const parachainIsRegistered = results.every(Boolean);
    expect(parachainIsRegistered).to.be.ok;
  };
};

const ParaBlockHeight = ({
  node_name,
  para_id,
  target_value,
  op,
  timeout,
}: FnArgs) => {
  timeout = timeout || DEFAULT_INDIVIDUAL_TEST_TIMEOUT;
  return async (network: Network) => {
    const nodes = network.getNodes(node_name!);
    const comparatorFn = comparators[op!];

    const results = await Promise.all(
      nodes.map((node: any) =>
        node.parachainBlockHeight(para_id!, target_value!, timeout),
      ),
    );
    for (const value of results) {
      comparatorFn(value, target_value!);
    }
  };
};

const ParaRuntimeUpgrade = ({
  node_name,
  para_id,
  file_or_uri,
  timeout,
}: FnArgs) => {
  timeout = timeout || DEFAULT_INDIVIDUAL_TEST_TIMEOUT;
  return async (
    network: Network,
    _backchannelMap: BackchannelMap,
    configBasePath: string,
  ) => {
    const node = network.node(node_name!);
    let api: ApiPromise = await connect(node.wsUri);
    let hash;

    if (isValidHttpUrl(file_or_uri!)) {
      hash = await chainUpgradeFromUrl(api, file_or_uri!);
    } else {
      const resolvedJsFilePath = path.resolve(configBasePath, file_or_uri!);
      hash = await chainUpgradeFromLocalFile(api, resolvedJsFilePath);
    }

    // validate in a node of the relay chain
    api.disconnect();
    const { wsUri, userDefinedTypes } = network.relay[0];
    api = await connect(wsUri, userDefinedTypes);
    const valid = await validateRuntimeCode(api, para_id!, hash, timeout);
    api.disconnect();

    expect(valid).to.be.ok;
  };
};

const ParaRuntimeDummyUpgrade = ({ node_name, para_id, timeout }: FnArgs) => {
  timeout = timeout || DEFAULT_INDIVIDUAL_TEST_TIMEOUT;
  return async (network: Network) => {
    const collator = network.paras[para_id!].nodes[0];
    let node = network.node(collator.name);
    let api: ApiPromise = await connect(node.wsUri);
    const hash = await chainCustomSectionUpgrade(api);

    // validate in the <node>: of the relay chain
    node = network.node(node_name!);
    api = await connect(node.wsUri);
    const valid = await validateRuntimeCode(api, para_id!, hash, timeout);
    api.disconnect();

    expect(valid).to.be.ok;
  };
};

export default {
  IsUp,
  Report,
  Histogram,
  Trace,
  LogMatch,
  CountLogMatch,
  SystemEvent,
  CustomJs,
  CustomSh,
  ParaBlockHeight,
  ParaIsRegistered,
  ParaRuntimeUpgrade,
  ParaRuntimeDummyUpgrade,
};
