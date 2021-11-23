import { ApiPromise, WsProvider } from "@polkadot/api";
import { Metrics, fetchMetrics, getMetricName } from "./metrics";
import { DEFAULT_INDIVIDUAL_TEST_TIMEOUT, PROMETHEUS_PORT } from "./configManager";
import { getClient } from "./providers/k8s";
import type { HeadData, ParaId } from "@polkadot/types/interfaces";
import type { Option, Vec } from "@polkadot/types";

const debug = require('debug')('zombie::network-node');

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

  constructor(
    name: string,
    wsUri: string,
    prometheusUri: string,
    userDefinedTypes: any = null,
  ) {
    this.name = name;
    this.wsUri = wsUri;
    this.prometheusUri = prometheusUri;

    if(userDefinedTypes) this.userDefinedTypes = userDefinedTypes;

  }

  async connectApi() {
    const provider = new WsProvider(this.wsUri);
    this.apiInstance = await ApiPromise.create({ provider, types: this.userDefinedTypes });
  }

  async restart(timeout:number|null = null) {
    const client = getClient();
    const args = ["exec", this.name, "--",  "/bin/bash", "-c"];
    const cmd = (timeout) ?
      `echo restart ${timeout} > /tmp/zombiepipe` :
      `echo restart > /tmp/zombiepipe`;
    args.push(cmd);

    await client._kubectl(args, undefined, true);
  }

  async pause() {
    const client = getClient();
    const args = ["exec", this.name, "--",  "/bin/bash", "-c", "echo pause > /tmp/zombiepipe"];
    await client._kubectl(args, undefined, true);
  }

  async resume() {
    const client = getClient();
    const args = ["exec", this.name, "--",  "/bin/bash", "-c", "echo pause > /tmp/zombiepipe"];
    await client._kubectl(args, undefined, true);
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

  async parachainIsRegistered(parachainId: number, timeout = DEFAULT_INDIVIDUAL_TEST_TIMEOUT): Promise<boolean> {
    let expired = false;
    let limitTimeout;
    try {
      limitTimeout = setTimeout(() => {
        expired = true;
      }, timeout * 1000);

      if(! this.apiInstance) this.connectApi();
      let done = false;
      while (!done) {
        if( expired ) throw new Error(`Timeout(${timeout}s)`);
        // wait 2 secs between checks
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const parachains = await this.apiInstance?.query.paras.parachains<Vec<ParaId>>() || [];
        debug(`parachains : ${JSON.stringify(parachains)}`);
        done = (parachains.findIndex((id) => id.toString() == parachainId.toString())) >= 0;
      }

      return true;
    } catch (err) {
      console.log(err);
      if (limitTimeout) clearTimeout(limitTimeout);
      return false;
    }
  }

  async parachainBlockHeight(parachainId: number, desiredValue: number, timeout = DEFAULT_INDIVIDUAL_TEST_TIMEOUT): Promise<number> {
    let expired = false;
    let limitTimeout;
    try {
      limitTimeout = setTimeout(() => {
        expired = true;
      }, timeout * 1000);

      if(! this.apiInstance) this.connectApi();
      let done = false;
      let value: number = 0;
      while (!done) {
        if( expired ) throw new Error(`Timeout(${timeout}s)`);

        const optHeadData = await this.apiInstance?.query.paras.heads<Option<HeadData>>(parachainId);

        if (optHeadData?.isSome) {
          const header = this.apiInstance?.createType("Header", optHeadData.unwrap().toHex());
          const headerStr = JSON.stringify(header?.toHuman(), null, 2);

          const headerObj = JSON.parse(headerStr);
          const blockNumber = parseInt(headerObj["number"].replace(",", ""));
          debug(`blockNumber : ${blockNumber}`);

          if (desiredValue <= blockNumber ) {
            done = true;
            value = blockNumber;
          }
        }
        // wait 2 secs between checks
        if(!done) await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      debug('returning: ' + value);
      clearTimeout(limitTimeout);
      return value||0;
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
      if( value !== undefined) {
        if (desiredMetricValue === null || value >= desiredMetricValue ) {
          debug(`value: ${value} ~ desiredMetricValue: ${desiredMetricValue}`);
          clearTimeout(limitTimeout);
          return value;
        }
      }

      // loop until get the desired value or timeout
      let done = false;
      let c = 0;
      while (!done) {
        if( expired ) throw new Error(`Timeout(${timeout}s)`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        c+=1;
        // refresh metrics
        try {
          debug(`fetching metrics - q: ${c}  time:  ${new Date()}`);
          this.cachedMetrics = await fetchMetrics(this.prometheusUri);
          debug('metric fetched');
        } catch( err ) {
          debug(`Error fetching metrics, recreating port-fw`);
          debug( err );
          // re-create port-fw
          const client = getClient();
          const newPort = await client.startPortForwarding(PROMETHEUS_PORT,`Pod/${this.name}`);
          this.prometheusUri = `http://127.0.0.1:${newPort}/metrics`;
          continue;
        }
        value = this._getMetric(metricName, desiredMetricValue === null);
        if (value !== undefined && desiredMetricValue !== null && desiredMetricValue <= value) {
          done = true;
        } else {
          // debug
          debug(`current value: ${value} for metric ${rawmetricName}, keep trying...`);
        }
      }

      debug('returning: ' + value);
      clearTimeout(limitTimeout);
      return value||0;
    } catch (err) {
      if (limitTimeout) clearTimeout(limitTimeout);
      throw new Error(`Error getting metric: ${rawmetricName}`);
    }
  }

  _getMetric(metricName: string, metricShouldExists: boolean = true): number|undefined {
    if (!this.cachedMetrics) throw new Error("Metrics not availables");

    // loops over namespaces first
    for (const namespace of Object.keys(this.cachedMetrics)) {
      if (
        this.cachedMetrics[namespace] &&
        this.cachedMetrics[namespace][metricName] !== undefined
      )
        return this.cachedMetrics[namespace][metricName];
    }
    if(metricShouldExists) throw new Error("Metric not found!");
  }
}
