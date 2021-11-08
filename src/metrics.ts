//const fetch = require("node-fetch");
const debug = require('debug')('zombie::metrics');
import axios from "axios";

// metrics can have namespace
export interface Metrics {
  [propertyName: string]: {
    [propertyName: string]: number;
  };
}

// Map well know metric keys used to regex
enum metricKeysMapping {
  BlockHeight = 'block_height{status="best"}',
  FinalizedHeight = 'block_height{status="finalized"}',
  PeersCount = "sub_libp2p_peers_count",
}

export async function fetchMetrics(metricUri: string): Promise<Metrics> {
  try {
    debug(`fetching: ${metricUri}`);
    //const response = await fetch(metricUri);
    const response = await axios.get(metricUri, {timeout: 2000});
    debug("fetched");
    //const body = await response.text();
    //const metrics = _extractMetrics(body);
    const metrics = _extractMetrics(response.data);
    return metrics;
  } catch( err ) {
    debug(`ERR: ${err}`);
    throw new Error(`Error fetching metrics from: ${metricUri}`);
  }
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
    case "peers count":
    case "peers":
      metricNameTouse = metricKeysMapping.PeersCount;
    default:
      break;
  }

  return metricNameTouse;
}

function _extractMetrics(text: string): Metrics {
  let rawMetrics: Metrics = {};
  for (const line of text.split("\n")) {
    if (line.length === 0 || line[0] === "#") continue; // comments and empty lines
    const [key, value] = line.split(" ", 2);
    // get the namespace of the key
    const parts = key.split("_");
    if (!rawMetrics[parts[0]]) rawMetrics[parts[0]] = {};
    rawMetrics[parts[0]][parts.slice(1).join("_")] = parseInt(value);
  }

  return rawMetrics;
}
