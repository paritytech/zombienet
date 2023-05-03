import { ApiPromise, WsProvider } from "@polkadot/api";
import { makeRe } from "minimatch";

import {
  DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
  LOCALHOST,
  RPC_WS_PORT,
  WS_URI_PATTERN,
} from "./constants";
import {
  BucketHash,
  Metrics,
  fetchMetrics,
  getHistogramBuckets,
  getMetricName,
} from "./metrics";
import { getClient } from "./providers/client";

import { TimeoutAbortController, decorators } from "@zombienet/utils";
import { paraGetBlockHeight, paraIsRegistered } from "./jsapi-helpers";
import { PARA } from "./paras-decorators";

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
  prometheusPrefix?: string;
  multiAddress: string;
  apiInstance?: ApiPromise;
  spec?: object | undefined;
  cachedMetrics?: Metrics;
  userDefinedTypes: any;
  para?: PARA;
  parachainId?: number;
  lastLogLineCheckedTimestamp?: string;
  lastLogLineCheckedIndex?: number;
  group?: string;

  constructor(
    name: string,
    wsUri: string,
    prometheusUri: string,
    multiAddress: string,
    userDefinedTypes: any = null,
    prometheusPrefix = "substrate",
  ) {
    this.name = name;
    this.wsUri = wsUri;
    this.prometheusUri = prometheusUri;
    this.multiAddress = multiAddress;
    this.prometheusPrefix = prometheusPrefix;

    if (userDefinedTypes) this.userDefinedTypes = userDefinedTypes;
  }

  async connectApi() {
    const provider = new WsProvider(this.wsUri);
    debug(`Connecting api for ${this.name} at ${this.wsUri}...`);
    this.apiInstance = await ApiPromise.create({
      provider,
      types: this.userDefinedTypes,
    });

    await this.apiInstance.isReady;
    debug(`Connected to ${this.name}`);
  }

  async restart(timeout: number | null = null) {
    const client = getClient();
    await client.restartNode(this.name, timeout);

    const url = new URL(this.wsUri);
    if (
      parseInt(url.port, 10) !== RPC_WS_PORT &&
      client.providerName !== "native"
    ) {
      const fwdPort = await client.startPortForwarding(RPC_WS_PORT, this.name);

      this.wsUri = WS_URI_PATTERN.replace("{{IP}}", LOCALHOST).replace(
        "{{PORT}}",
        fwdPort.toString(),
      );

      this.apiInstance = undefined;
    }

    return true;
  }

  async pause() {
    const client = getClient();
    const args = client.getPauseArgs(this.name);
    const scoped = client.providerName === "kubernetes";

    const result = await client.runCommand(args, { scoped });
    return result.exitCode === 0;
  }

  async resume() {
    const client = getClient();
    const args = client.getResumeArgs(this.name);
    const scoped = client.providerName === "kubernetes";
    const result = await client.runCommand(args, { scoped });
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
      console.log(
        `\n ${decorators.red("Error: ")} \t ${decorators.bright(err)}\n`,
      );
      return false;
    } finally {
      if (limitTimeout) clearTimeout(limitTimeout);
    }
  }

  async parachainIsRegistered(
    parachainId: number,
    timeout = DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
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
          parachainId,
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
    timeout = DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
  ): Promise<number> {
    let value = 0;
    try {
      const getValue = async () => {
        while (desiredValue > value) {
          // reconnect iff needed
          if (!this.apiInstance) await this.connectApi();

          await new Promise((resolve) => setTimeout(resolve, 2000));
          const blockNumber = await paraGetBlockHeight(
            this.apiInstance as ApiPromise,
            parachainId,
          );

          value = blockNumber;
        }
        return;
      };

      const resp = await Promise.race([
        getValue(),
        new Promise((resolve) =>
          setTimeout(() => {
            const err = new Error(
              `Timeout(${timeout}), "getting desired parachain block height ${desiredValue} within ${timeout} secs".`,
            );
            return resolve(err);
          }, timeout * 1000),
        ),
      ]);
      if (resp instanceof Error) throw resp;
      return value;
    } catch (err: any) {
      console.log(
        `\n\t ${decorators.red("Error: ")} \n\t\t ${decorators.bright(
          err?.message,
        )}\n`,
      );
      return value || 0;
    }
  }

  async getMetric(
    rawMetricName: string,
    comparator: string,
    desiredMetricValue: number | null = null,
    timeout = DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
  ): Promise<number | undefined> {
    let value;
    let timedout = false;
    try {
      // process_start_time_seconds metric is used by `is up`, and we don't want to use cached values.
      if (
        desiredMetricValue === null ||
        !this.cachedMetrics ||
        rawMetricName === "process_start_time_seconds"
      ) {
        debug("reloading cache");
        this.cachedMetrics = await fetchMetrics(this.prometheusUri);
      }

      const metricName = getMetricName(rawMetricName);
      value = this._getMetric(metricName, desiredMetricValue === null);
      if (value !== undefined) {
        if (
          desiredMetricValue === null ||
          compare(comparator, value, desiredMetricValue)
        ) {
          debug(`value: ${value} ~ desiredMetricValue: ${desiredMetricValue}`);
          return value;
        }
      }

      const getValue = async () => {
        let c = 0;
        let done = false;
        while (!done) {
          c++;
          await new Promise((resolve) => setTimeout(resolve, 1000));
          debug(`fetching metrics - q: ${c}  time:  ${new Date()}`);
          this.cachedMetrics = await fetchMetrics(this.prometheusUri);
          value = this._getMetric(metricName, desiredMetricValue === null);

          if (
            value !== undefined &&
            desiredMetricValue !== null &&
            compare(comparator, value, desiredMetricValue)
          ) {
            done = true;
          } else {
            debug(
              `current value: ${value} for metric ${rawMetricName}, keep trying...`,
            );
          }
        }
      };

      const resp = await Promise.race([
        getValue(),
        new Promise((resolve) =>
          setTimeout(() => {
            timedout = true;
            const err = new Error(
              `Timeout(${timeout}), "getting desired metric value ${desiredMetricValue} within ${timeout} secs".`,
            );
            return resolve(err);
          }, timeout * 1000),
        ),
      ]);
      if (resp instanceof Error) {
        // use `undefined` metrics values in `equal` comparations as `0`
        if (timedout && comparator === "equal" && desiredMetricValue === 0)
          value = 0;
        else throw resp;
      }

      return value || 0;
    } catch (err: any) {
      console.log(
        `\n\t ${decorators.red("Error: ")} \n\t\t ${decorators.bright(
          err?.message,
        )}\n`,
      );
      return value;
    }
  }

  async getHistogramSamplesInBuckets(
    rawmetricName: string,
    buckets: string[], // empty string means all.
    desiredMetricValue: number | null = null,
    timeout = DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
  ): Promise<number> {
    let value;
    try {
      const metricName = getMetricName(rawmetricName);
      let histogramBuckets = await getHistogramBuckets(
        this.prometheusUri,
        metricName,
      );
      let value = this._getSamplesCount(histogramBuckets, buckets);
      if (desiredMetricValue === null || value >= desiredMetricValue) {
        debug(`value: ${value} ~ desiredMetricValue: ${desiredMetricValue}`);
        return value;
      }

      const getValue = async () => {
        let done = false;
        while (!done) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          histogramBuckets = await getHistogramBuckets(
            this.prometheusUri,
            metricName,
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
              `current value: ${value} for samples count of ${rawmetricName}, keep trying...`,
            );
          }
        }
      };

      const resp = await Promise.race([
        getValue(),
        new Promise((resolve) =>
          setTimeout(() => {
            const err = new Error(
              `Timeout(${timeout}), "getting samples count value ${desiredMetricValue} within ${timeout} secs".`,
            );
            return resolve(err);
          }, timeout * 1000),
        ),
      ]);
      if (resp instanceof Error) throw resp;

      return value || 0;
    } catch (err: any) {
      console.log(
        `\n\t ${decorators.red("Error: ")} \n\t\t ${decorators.bright(
          err?.message,
        )}\n`,
      );
      return value || 0;
    }
  }

  async countPatternLines(
    pattern: string,
    isGlob: boolean,
    timeout: number = DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
  ): Promise<number> {
    try {
      let total_count = 0;
      const re = isGlob ? makeRe(pattern) : new RegExp(pattern, "ig");
      if (!re) throw new Error(`Invalid glob pattern: ${pattern} `);
      const client = getClient();
      const getValue = async (): Promise<number> => {
        await new Promise((resolve) => setTimeout(resolve, timeout * 1000));
        const logs = await client.getNodeLogs(this.name, undefined, true);

        for (let line of logs.split("\n")) {
          if (client.providerName !== "native") {
            // remove the extra timestamp
            line = line.split(" ").slice(1).join(" ");
          }
          if (re.test(line)) {
            total_count += 1;
          }
        }
        return total_count;
      };

      const resp = await Promise.race([
        getValue(),
        new Promise(
          (resolve) =>
            setTimeout(() => {
              const err = new Error(
                `Timeout(${timeout}), "getting log pattern ${pattern} within ${timeout} secs".`,
              );
              return resolve(err);
            }, (timeout + 2) * 1000), //extra 2s for processing log
        ),
      ]);
      if (resp instanceof Error) throw resp;

      return total_count;
    } catch (err: any) {
      console.log(
        `\n\t ${decorators.red("Error: ")} \n\t\t ${decorators.bright(
          err?.message,
        )}\n`,
      );
      return 0;
    }
  }

  async findPattern(
    pattern: string,
    isGlob: boolean,
    timeout: number = DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
  ): Promise<boolean> {
    try {
      const re = isGlob ? makeRe(pattern) : new RegExp(pattern, "ig");
      if (!re) throw new Error(`Invalid glob pattern: ${pattern} `);
      const client = getClient();
      let logs = await client.getNodeLogs(this.name, undefined, true);
      const getValue = async () => {
        let done = false;
        while (!done) {
          const dedupedLogs = this._dedupLogs(
            logs.split("\n"),
            client.providerName === "native",
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
            debug(
              this.lastLogLineCheckedTimestamp.split(" ").slice(1).join(" "),
            );
          } else {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            logs = await client.getNodeLogs(this.name, 2, true);
          }
        }
      };

      const resp = await Promise.race([
        getValue(),
        new Promise((resolve) =>
          setTimeout(() => {
            const err = new Error(
              `Timeout(${timeout}), "getting log pattern ${pattern} within ${timeout} secs".`,
            );
            return resolve(err);
          }, timeout * 1000),
        ),
      ]);
      if (resp instanceof Error) throw resp;

      return true;
    } catch (err: any) {
      console.log(
        `\n\t ${decorators.red("Error: ")} \n\t\t ${decorators.bright(
          err?.message,
        )}\n`,
      );
      return false;
    }
  }

  async run(
    scriptPath: string,
    args: string[],
    timeout = DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
  ) {
    const client = getClient();
    const runScript = async (scriptPath: string, args: string[]) => {
      const r = await client.runScript(this.name, scriptPath, args);
      if (r.exitCode !== 0)
        throw new Error(`Error running cmd: ${scriptPath} with args ${args}`);
      debug(r.stdout);
      return r.stdout;
    };

    const resp = await Promise.race([
      runScript(scriptPath, args),
      new Promise((resolve) =>
        setTimeout(() => {
          const err = new Error(
            `Timeout(${timeout}), "running cmd: ${scriptPath} with args ${args} within ${timeout} secs".`,
          );
          return resolve(err);
        }, timeout * 1000),
      ),
    ]);
    if (resp instanceof Error) throw resp;
  }

  async getSpansByTraceId(
    traceId: string,
    collatorUrl: string,
  ): Promise<string[]> {
    const url = `${collatorUrl}/api/traces/${traceId}`;

    const fetchResult = await fetch(url, {
      signal: TimeoutAbortController(2).signal,
    });
    const response = await fetchResult.json();

    // filter batches
    const batches = response.data.batches.filter((batch: any) => {
      const serviceNameAttr = batch.resource.attributes.find((attr: any) => {
        return attr.key === "service.name";
      });

      if (!serviceNameAttr) return false;

      return (
        serviceNameAttr.value.stringValue.split("-").slice(1).join("-") ===
        this.name
      );
    });

    // get the `names` of the spans
    const spanNames: string[] = [];
    for (const batch of batches) {
      for (const instrumentationSpan of batch.instrumentationLibrarySpans) {
        for (const span of instrumentationSpan.spans) {
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
    metricShouldExists = true,
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
      return a > b;
    case "isAtLeast":
      return a >= b;
    case "isBelow":
      return a < b;
    default:
      return a == b;
  }
}
