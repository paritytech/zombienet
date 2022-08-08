import { ApiPromise, WsProvider } from "@polkadot/api";
import minimatch from "minimatch";
import axios from "axios";

import {
  Metrics,
  fetchMetrics,
  getMetricName,
  getHistogramBuckets,
  BucketHash,
} from "./metrics";
import { DEFAULT_INDIVIDUAL_TEST_TIMEOUT, PROMETHEUS_PORT } from "./constants";
import { getClient } from "./providers/client";

import { paraGetBlockHeight, paraIsRegistered, validateRuntimeCode } from "./jsapi-helpers";
import { decorators } from "./utils/colors";
import { resolve } from "path";

const debug = require("debug")("zombie::network-node");

export interface NetworkNodeInterface {
  name: string;
  wsUri?: string;
  prometheusUri?: string;
  apiInstance?: ApiPromise;
}

export class NetworkNode implements NetworkNodeInterface {
  name: string;
  wsUri: string;
  prometheusUri: string;
  apiInstance?: ApiPromise;
  spec?: object | undefined;
  cachedMetrics?: Metrics;
  userDefinedTypes: any;
  parachainId?: number;
  lastLogLineCheckedTimestamp?: string;
  lastLogLineCheckedIndex?: number;
  group?: string;

  constructor(
    name: string,
    wsUri: string,
    prometheusUri: string,
    userDefinedTypes: any = null
  ) {
    this.name = name;
    this.wsUri = wsUri;
    this.prometheusUri = prometheusUri;

    if (userDefinedTypes) this.userDefinedTypes = userDefinedTypes;
  }

  async connectApi() {
    const provider = new WsProvider(this.wsUri);
    debug(`Connecting api for ${this.name} at ${this.wsUri}...`);
    this.apiInstance = await ApiPromise.create({
      provider,
      types: this.userDefinedTypes,
    });
    debug(`Connected to ${this.name}`);
  }

  async restart(timeout: number | null = null) {
    const client = getClient();
    const args = ["exec", this.name, "--", "/bin/bash", "-c"];
    const cmd = timeout
      ? `echo restart ${timeout} > /tmp/zombiepipe`
      : `echo restart > /tmp/zombiepipe`;
    args.push(cmd);

    const result = await client.runCommand(args, undefined, true);
    return result.exitCode === 0;
  }

  async pause() {
    const client = getClient();
    const args = [
      "exec",
      this.name,
      "--",
      "/bin/bash",
      "-c",
      "echo pause > /tmp/zombiepipe",
    ];
    const result = await client.runCommand(args, undefined, true);
    return result.exitCode === 0;
  }

  async resume() {
    const client = getClient();
    const args = [
      "exec",
      this.name,
      "--",
      "/bin/bash",
      "-c",
      "echo pause > /tmp/zombiepipe",
    ];
    const result = await client.runCommand(args, undefined, true);
    return result.exitCode === 0;
  }

  async isUp(timeout = DEFAULT_INDIVIDUAL_TEST_TIMEOUT): Promise<boolean> {
    let limitTimeout;
    try {
      limitTimeout = setTimeout(() => {
        throw new Error(`Timeout(${timeout}s)`);
      }, timeout * 1000);

      await this.apiInstance?.rpc.system.name();
      return true;
    } catch (err) {
      console.log(err);
      return false;
    } finally {
      if (limitTimeout) clearTimeout(limitTimeout);
    }
  }

  async parachainIsRegistered(
    parachainId: number,
    timeout = DEFAULT_INDIVIDUAL_TEST_TIMEOUT
  ): Promise<boolean> {
    let expired = false;
    let limitTimeout;
    try {
      limitTimeout = setTimeout(() => {
        expired = true;
      }, timeout * 1000);

      if (!this.apiInstance) await this.connectApi();
      let done = false;
      while (!done) {
        if (expired) throw new Error(`Timeout(${timeout}s)`);
        // wait 2 secs between checks
        await new Promise((resolve) => setTimeout(resolve, 2000));
        done = await paraIsRegistered(
          this.apiInstance as ApiPromise,
          parachainId
        );
      }

      return true;
    } catch (err) {
      console.log(err);
      if (limitTimeout) clearTimeout(limitTimeout);
      return false;
    }
  }

  async parachainBlockHeight(
    parachainId: number,
    desiredValue: number,
    timeout = DEFAULT_INDIVIDUAL_TEST_TIMEOUT
  ): Promise<number> {
    let value: number = 0;
    try {
      const getValue = async () => {
        while(desiredValue > value) {
          // reconnect iff needed
          if (!this.apiInstance) await this.connectApi();

          await new Promise((resolve) => setTimeout(resolve, 2000));
          let blockNumber = await paraGetBlockHeight(
            this.apiInstance as ApiPromise,
            parachainId
          );

          value = blockNumber;
        }
        return;
      }

      const resp = await Promise.race([
        getValue(),
        new Promise((resolve) => setTimeout(() => {
          const err = new Error(`Timeout(${timeout}), "getting desired parachain block height ${desiredValue} within ${timeout} secs".`);
          return resolve(err);
        }, timeout * 1000))
      ]);
      if( resp instanceof Error ) throw resp
      return value;
    } catch(err: any) {
      console.log(`\n\t ${decorators.red("Error: ")} \n\t\t ${decorators.red(err.message)}\n`);
      return value || 0;
    }
  }

  async getMetric(
    rawmetricName: string,
    comparator: string,
    desiredMetricValue: number | null = null,
    timeout = DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
  ): Promise<number|undefined> {
    let value;
    let timedout = false;
    try {
      if (desiredMetricValue === null || !this.cachedMetrics) {
        debug("reloading cache");
        this.cachedMetrics = await fetchMetrics(this.prometheusUri);
      }

      const metricName = getMetricName(rawmetricName);
      value = this._getMetric(metricName, desiredMetricValue === null);
      if (value !== undefined) {
        if (desiredMetricValue === null || compare(comparator, value, desiredMetricValue)) {
          debug(`value: ${value} ~ desiredMetricValue: ${desiredMetricValue}`);
          return value;
        }
      }

      const getValue = async () => {
        let c = 0;
        let done = false;
        while(!done) {
          c++;
          await new Promise((resolve) => setTimeout(resolve, 1000));
          debug(`fetching metrics - q: ${c}  time:  ${new Date()}`);
          this.cachedMetrics = await fetchMetrics(this.prometheusUri);
          value = this._getMetric(metricName, desiredMetricValue === null);

          if (
            value !== undefined &&
            desiredMetricValue !== null &&
            compare(comparator,value, desiredMetricValue)
          ) {
            done = true;
          } else {
            debug(
              `current value: ${value} for metric ${rawmetricName}, keep trying...`
            );
          }
        }
      }

      const resp = await Promise.race([
        getValue(),
        new Promise((resolve) => setTimeout(() => {
          timedout = true;
          const err = new Error(`Timeout(${timeout}), "getting desired metric value ${desiredMetricValue} within ${timeout} secs".`);
          return resolve(err);
        }, timeout * 1000))
      ]);
      if( resp instanceof Error ) {
        // use `undefined` metrics values in `equal` comparations as `0`
        if(timedout && comparator === "equal" && desiredMetricValue === 0) value = 0;
        else throw resp;
      }

      return value || 0;
    } catch(err: any) {
      console.log(`\n\t ${decorators.red("Error: ")} \n\t\t ${decorators.red(err.message)}\n`);
      return value;
    }
  }

  async getHistogramSamplesInBuckets(
    rawmetricName: string,
    buckets: string[], // empty string means all.
    desiredMetricValue: number | null = null,
    timeout = DEFAULT_INDIVIDUAL_TEST_TIMEOUT
  ): Promise<number> {
    let value;
    try {
      const metricName = getMetricName(rawmetricName);
      let histogramBuckets = await getHistogramBuckets(
        this.prometheusUri,
        metricName
      );
      let value = this._getSamplesCount(histogramBuckets, buckets);
      if (desiredMetricValue === null || value >= desiredMetricValue) {
        debug(`value: ${value} ~ desiredMetricValue: ${desiredMetricValue}`);
        return value;
      }

      const getValue = async () => {
        let c = 0;
        let done = false;
        while(!done) {
          c++;
          await new Promise((resolve) => setTimeout(resolve, 1000));
          histogramBuckets = await getHistogramBuckets(
            this.prometheusUri,
            metricName
          );

          value = this._getSamplesCount(histogramBuckets, buckets);
          if (
            value !== undefined &&
            desiredMetricValue !== null &&
            desiredMetricValue <= value
          ) {
            done = true;
          } else {
            debug(
              `current value: ${value} for samples count of ${rawmetricName}, keep trying...`
            );
          }
        }
      }

      const resp = await Promise.race([
        getValue(),
        new Promise((resolve) => setTimeout(() => {
          const err = new Error(`Timeout(${timeout}), "getting samples count value ${desiredMetricValue} within ${timeout} secs".`);
          return resolve(err);
        }, timeout * 1000))
      ]);
      if( resp instanceof Error ) throw resp;

      return value || 0;
    } catch(err: any){
      console.log(`\n\t ${decorators.red("Error: ")} \n\t\t ${decorators.red(err.message)}\n`);
      return value || 0;
    }
  }

  async findPattern(
    pattern: string,
    isGlob: boolean,
    timeout: number = DEFAULT_INDIVIDUAL_TEST_TIMEOUT
  ): Promise<boolean> {
    try {
      const re = isGlob ? minimatch.makeRe(pattern) : new RegExp(pattern, "ig");
      const client = getClient();
      let logs = await client.getNodeLogs(this.name, undefined,  true);
      const getValue = async () => {
        let done = false;
        while (!done) {
          const dedupedLogs = this._dedupLogs(
            logs.split("\n"),
            client.providerName === "native"
          );
          const index = dedupedLogs.findIndex((line) => {
            if (client.providerName !== "native") {
              // remove the extra timestamp
              line = line.split(" ").slice(1).join(" ");
            }
            return re.test(line);
          });

          if (index >= 0) {
            done = true;
            this.lastLogLineCheckedTimestamp = dedupedLogs[index];
            this.lastLogLineCheckedIndex = index;
            debug(this.lastLogLineCheckedTimestamp.split(" ").slice(1).join(" "));
          } else {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            logs = await client.getNodeLogs(this.name, 2,  true);
          }
        }
      }

      const resp = await Promise.race([
        getValue(),
        new Promise((resolve) => setTimeout(() => {
          const err = new Error(`Timeout(${timeout}), "getting log pattern ${pattern} within ${timeout} secs".`);
          return resolve(err);
        }, timeout * 1000))
      ]);
      if( resp instanceof Error ) throw resp;

      return true;
    } catch(err: any) {
      console.log(`\n\t ${decorators.red("Error: ")} \n\t\t ${decorators.red(err.message)}\n`);
      return false;
    }
  }

  async run(
    scriptPath: string,
    args: string[],
    timeout = DEFAULT_INDIVIDUAL_TEST_TIMEOUT) {
      const client = getClient();
      const runScript = async (scriptPath: string, args: string[]) => {
        const r = await client.runScript(this.name, scriptPath, args);
        if( r.exitCode !== 0 ) throw new Error(`Error running cmd: ${scriptPath} with args ${args}`);
        debug(r.stdout);
        return r.stdout;
      };

      const resp = await Promise.race([
        runScript(scriptPath, args),
        new Promise((resolve) => setTimeout(() => {
          const err = new Error(`Timeout(${timeout}), "running cmd: ${scriptPath} with args ${args} within ${timeout} secs".`);
          return resolve(err);
        }, timeout * 1000))
      ]);
      if( resp instanceof Error ) throw resp;
  }

  async getSpansByTraceId(traceId: string, collatorUrl: string): Promise<string[]> {
    const url = `${collatorUrl}/api/traces/${traceId}`;
    const response = await axios.get(url, { timeout: 2000 });

    // filter batches
    const batches = response.data.batches.filter( (batch: any) => {
      const serviceNameAttr = batch.resource.attributes.find((attr:any) => {
        return attr.key === "service.name";
      });

      if(!serviceNameAttr) return false;

      return serviceNameAttr.value.stringValue.split('-').slice(1).join('-') === this.name;
    });

    // get the `names` of the spans
    const spanNames: string[] = [];
    for(const batch of batches) {
      for(const instrumentationSpan of batch.instrumentationLibrarySpans) {
        for(const span of instrumentationSpan.spans) {
          spanNames.push(span.name);
        }
      }
    }

    return spanNames;
  }

  // prevent to seach in the same log line twice.
  _dedupLogs(logs: string[], useIndex = false): string[] {
    if (!this.lastLogLineCheckedTimestamp) return logs;
    if (useIndex) return logs.slice(this.lastLogLineCheckedIndex);

    const lastLineTs = this.lastLogLineCheckedTimestamp.split(" ")[0];
    const index = logs.findIndex((logLine) => {
      const thisLineTs = logLine.split(" ")[0];
      return thisLineTs > lastLineTs;
    });
    return logs.slice(index);
  }

  _getMetric(
    metricName: string,
    metricShouldExists: boolean = true
  ): number | undefined {
    if (!this.cachedMetrics) throw new Error("Metrics not availables");

    // loops over namespaces first
    for (const namespace of Object.keys(this.cachedMetrics)) {
      if (
        this.cachedMetrics[namespace] &&
        this.cachedMetrics[namespace][metricName] !== undefined
      ) {
        debug("returning for: " + metricName + " from ns: " + namespace);
        debug("returning: " + this.cachedMetrics[namespace][metricName]);
        return this.cachedMetrics[namespace][metricName];
      }
    }
    if (metricShouldExists) throw new Error(`Metric: ${metricName} not found!`);
  }

  _getSamplesCount(buckets: BucketHash, bucketKeys: string[]): number {
    debug("buckets samples count:");
    debug(buckets);
    debug(bucketKeys);
    let count = 0;
    for (const key of bucketKeys) {
      if (buckets[key] === undefined)
        throw new Error(`Bucket with le: ${key} is NOT present in metrics`);
      count += buckets[key];
    }
    return count;
  }
}


function compare(comparator: string, a: any, b: any): boolean {
  debug(`using comparator ${comparator} for ${a}, ${b}`);
  switch (comparator.trim()) {
    case "equal":
      return a == b;
    case "isAbove":
      return a > b
    case "isAtLeast":
      return a >= b;
    case "isBelow":
      return a < b;
    default:
      return a == b;
  }
}
