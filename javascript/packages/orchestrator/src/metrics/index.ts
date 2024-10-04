const debug = require("debug")("zombie::metrics");
import { decorators, TimeoutAbortController } from "@zombienet/utils";
import { DEFAULT_PROMETHEUS_PREFIX } from "../constants";
import { parseLine } from "./parseLine";

// metrics can have namespace
export interface Metrics {
  [propertyName: string]: {
    [propertyName: string]: number;
  };
}

export interface BucketHash {
  [le: string]: number;
}

// Map well know metric keys used to regex
enum metricKeysMapping {
  BlockHeight = 'block_height{status="best"}',
  FinalizedHeight = 'block_height{status="finalized"}',
  PeersCount = "sub_libp2p_peers_count",
}

export async function fetchMetrics(metricUri: string, node_name = ""): Promise<Metrics> {
  let metrics = {}; // empty by default
  let debug_msg = node_name ? `[${node_name}]` : "";
  try {

    debug([debug_msg,`fetching: ${metricUri}`].join(" "));
    const fetchResult = await fetch(metricUri, {
      signal: TimeoutAbortController(2).signal,
      method: "GET",
      headers: {
        accept: "application/json",
      },
    });

    if (!fetchResult.ok) {
      throw new Error(`Error - status: ${fetchResult.status}`);
    }

    const response = await fetchResult.text();
    metrics = _extractMetrics(response);
  } catch (err) {
    debug(`ERR: ${err}`);
    console.log(
      `\n${decorators.red(`Error`)} \t ${decorators.bright(
        `fetching metrics from: ${metricUri} ${debug_msg}`,
      )}`,
    );
  }
  return metrics;
}

export async function getHistogramBuckets(
  metricUri: string,
  metricName: string,
): Promise<BucketHash> {
  debug(`fetching: ${metricUri}`);
  const fetchResult = await fetch(metricUri, {
    signal: TimeoutAbortController(2).signal,
    method: "GET",
    headers: {
      accept: "application/json",
    },
  });

  if (!fetchResult.ok) {
    throw new Error(`Error - status: ${fetchResult.status}`);
  }

  const response = await fetchResult.text();

  let previousBucketValue = 0;
  const buckets: any = {};

  const resolvedMetricName = metricName.includes("_bucket")
    ? metricName
    : `${metricName}_bucket`;
  const parsedMetricInput = parseLine(resolvedMetricName);

  for (const line of response.split("\n")) {
    if (line.length === 0 || line[0] === "#") continue; // comments and empty lines
    const parsedLine = parseLine(line);

    if (parsedMetricInput.name === parsedLine.name) {
      // check labels if are presents
      let thereAreSomeMissingLabel = false;
      for (const [k, v] of parsedMetricInput.labels.entries()) {
        console.log(`looking for key ${k}`);
        if (!parsedLine.labels.has(k) || parsedLine.labels.get(k) !== v) {
          thereAreSomeMissingLabel = true;
          break;
        }
      }

      if (thereAreSomeMissingLabel) continue; // don't match

      const metricValue = parseInt(parsedLine.value);
      const leLabel = parsedLine.labels.get("le");
      buckets[leLabel] = metricValue - previousBucketValue;
      previousBucketValue = metricValue;
      debug(`${parsedLine.name} le:${leLabel} ${metricValue}`);
    }
  }

  return buckets;
}

export function getMetricName(metricName: string): string {
  let metricNameTouse = metricName;
  switch (metricName) {
    case "blockheight":
    case "block height":
    case "best block":
      metricNameTouse = metricKeysMapping.BlockHeight;
      break;
    case "finalised height":
    case "finalised block":
      metricNameTouse = metricKeysMapping.FinalizedHeight;
      break;
    case "peers count":
    case "peers":
      metricNameTouse = metricKeysMapping.PeersCount;
      break;
    default:
      break;
  }

  return metricNameTouse;
}

export function getProcessStartTimeKey(prefix = DEFAULT_PROMETHEUS_PREFIX) {
  return `${prefix}_process_start_time_seconds`;
}

function _extractMetrics(text: string): Metrics {
  const rawMetrics: Metrics = {};
  rawMetrics["_raw"] = {};
  for (const line of text.split("\n")) {
    if (line.length === 0 || line[0] === "#") continue; // comments and empty lines
    const parsedLine = parseLine(line);
    const metricValue = parseInt(parsedLine.value);

    // get the namespace of the key
    const parts = parsedLine.name.split("_");
    const ns = parts[0];
    const rawMetricNameWithOutNs = parts.slice(1).join("_");

    const labelStrings = [];
    const labelStringsWithOutChain = [];
    for (const [k, v] of parsedLine.labels.entries()) {
      labelStrings.push(`${k}="${v}"`);
      if (k !== "chain") labelStringsWithOutChain.push(`${k}="${v}"`);
    }

    if (!rawMetrics[ns]) rawMetrics[ns] = {};

    // store the metric with and without the chain
    if (labelStrings.length > 0) {
      rawMetrics[ns][`${rawMetricNameWithOutNs}{${labelStrings.join(",")}}`] =
        metricValue;
      rawMetrics["_raw"][`${parsedLine.name}{${labelStrings.join(",")}}`] =
        metricValue;
    } else {
      rawMetrics[ns][rawMetricNameWithOutNs] = metricValue;
      rawMetrics["_raw"][parsedLine.name] = metricValue;
    }
    if (labelStringsWithOutChain.length > 0) {
      rawMetrics[ns][
        `${rawMetricNameWithOutNs}{${labelStringsWithOutChain.join(",")}}`
      ] = metricValue;
      rawMetrics["_raw"][
        `${parsedLine.name}{${labelStringsWithOutChain.join(",")}}`
      ] = metricValue;
    } else {
      rawMetrics[ns][rawMetricNameWithOutNs] = metricValue;
      rawMetrics["_raw"][parsedLine.name] = metricValue;
    }
  }

  return rawMetrics;
}
