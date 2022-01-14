import { ApiPromise, WsProvider } from "@polkadot/api";
import minimatch from "minimatch";

import { Metrics, fetchMetrics, getMetricName } from "./metrics";
import {
  DEFAULT_INDIVIDUAL_TEST_TIMEOUT,
  PROMETHEUS_PORT,
} from "./configManager";
import { getClient } from "./providers/client";

import { paraGetBlockHeight, paraIsRegistered } from "./jsapi-helpers";

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

    await client.runCommand(args, undefined, true);
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
    await client.runCommand(args, undefined, true);
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
    await client.runCommand(args, undefined, true);
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
    let expired = false;
    let limitTimeout;
    try {
      limitTimeout = setTimeout(() => {
        expired = true;
      }, timeout * 1000);

      // reconnect iff needed
      if (!this.apiInstance) await this.connectApi();
      let done = false;
      let value: number = 0;
      while (!done) {
        if (expired) throw new Error(`Timeout(${timeout}s)`);

        let blockNumber = await paraGetBlockHeight(
          this.apiInstance as ApiPromise,
          parachainId
        );
        if (desiredValue <= blockNumber) {
          done = true;
          value = blockNumber;
        }

        // wait 2 secs between checks
        if (!done) await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      debug("returning: " + value);
      clearTimeout(limitTimeout);
      return value || 0;
    } catch (err) {
      console.log(err);
      if (limitTimeout) clearTimeout(limitTimeout);
      return 0;
    }
  }

  async getMetric(
    rawmetricName: string,
    desiredMetricValue: number | null = null,
    timeout = DEFAULT_INDIVIDUAL_TEST_TIMEOUT
  ): Promise<number> {
    let limitTimeout;
    let expired: boolean = false;
    try {
      limitTimeout = setTimeout(() => {
        debug(`Timeout getting metric ${rawmetricName} (${timeout})`);
        expired = true;
      }, timeout * 1000);

      if (desiredMetricValue === null || !this.cachedMetrics) {
        debug("reloading cache");
        this.cachedMetrics = await fetchMetrics(this.prometheusUri);
      }
      const metricName = getMetricName(rawmetricName);
      let value = this._getMetric(metricName, desiredMetricValue === null);
      if (value !== undefined) {
        if (desiredMetricValue === null || value >= desiredMetricValue) {
          debug(`value: ${value} ~ desiredMetricValue: ${desiredMetricValue}`);
          clearTimeout(limitTimeout);
          return value;
        }
      }

      // loop until get the desired value or timeout
      let done = false;
      let c = 0;
      while (!done) {
        if (expired) throw new Error(`Timeout(${timeout}s)`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        c += 1;
        // refresh metrics
        try {
          debug(`fetching metrics - q: ${c}  time:  ${new Date()}`);
          this.cachedMetrics = await fetchMetrics(this.prometheusUri);
        } catch (err) {
          debug(`Error fetching metrics, recreating port-fw`);
          debug(err);
          // re-create port-fw
          const client = getClient();
          const newPort = await client.startPortForwarding(
            PROMETHEUS_PORT,
            `Pod/${this.name}`
          );
          this.prometheusUri = `http://127.0.0.1:${newPort}/metrics`;
          continue;
        }
        value = this._getMetric(metricName, desiredMetricValue === null);
        if (
          value !== undefined &&
          desiredMetricValue !== null &&
          desiredMetricValue <= value
        ) {
          done = true;
        } else {
          debug(
            `current value: ${value} for metric ${rawmetricName}, keep trying...`
          );
        }
      }

      debug("returning: " + value);
      clearTimeout(limitTimeout);
      return value || 0;
    } catch (err) {
      if (limitTimeout) clearTimeout(limitTimeout);
      throw new Error(`Error getting metric: ${rawmetricName}`);
    }
  }

  async findPattern(pattern: string, isGlob: boolean, timeout: number = DEFAULT_INDIVIDUAL_TEST_TIMEOUT): Promise<boolean> {
    let limitTimeout;
    let expired: boolean = false;
    try {
      limitTimeout = setTimeout(() => {
        debug(`Timeout getting pattern ${pattern} (${timeout})`);
        expired = true;
      }, timeout * 1000);

      const re = (isGlob) ? minimatch.makeRe(pattern) : new RegExp(pattern, "ig");
      const client = getClient();

      // loop until get the desired value or timeout
      let done = false;
      while (!done) {
        if (expired) throw new Error(`Timeout(${timeout}s)`);

        // By default use 2s since we sleep 1s.
        const logs = await client.getNodeLogs(this.name, 2, true);
        const dedupedLogs = this._dedupLogs(logs.split("\n"));
        const index = dedupedLogs.findIndex(line => {
          // remove the extra timestamp
          return re.test(line.split(" ").slice(1).join(" "));

        });

        if(index >= 0) {
          done = true;
          this.lastLogLineCheckedTimestamp = dedupedLogs[index];
          debug(this.lastLogLineCheckedTimestamp.split(" ").slice(1).join(" "));
          clearTimeout(limitTimeout);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      clearTimeout(limitTimeout);
      return true
    } catch (err) {
      if (limitTimeout) clearTimeout(limitTimeout);
      throw new Error(`Error getting pattern: ${pattern}`);
    }
  }

  // prevent to seach in the same log line twice.
  _dedupLogs(logs: string[]): string[] {
    if( ! this.lastLogLineCheckedTimestamp) return logs;
    const lastLineTs = this.lastLogLineCheckedTimestamp.split(" ")[0];
    const index = logs.findIndex(logLine => {
      const thisLineTs = logLine.split(" ")[0];
      return ( thisLineTs > lastLineTs );
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
        debug("returning for: " + metricName);
        debug("returning: " + this.cachedMetrics[namespace][metricName]);
        return this.cachedMetrics[namespace][metricName];
      }
    }
    if (metricShouldExists) throw new Error("Metric not found!");
  }
}
