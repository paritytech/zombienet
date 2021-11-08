import { ApiPromise, WsProvider } from "@polkadot/api";
import { Metrics, fetchMetrics, getMetricName } from "./metrics";
import { DEFAULT_INDIVIDUAL_TEST_TIMEOUT, PROMETHEUS_PORT } from "./configManager";
import { KubeClient } from "./providers/k8s";

const debug = require('debug')('zombie::network-node');

export interface NetworkNodeInterface {
  name: string;
  wsUri: string;
  prometheusUri: string;
  apiInstance?: ApiPromise;
  spec?: object;
  autoConnectApi: boolean;
  client: KubeClient;
}

export class NetworkNode implements NetworkNodeInterface {
  name: string;
  wsUri: string;
  prometheusUri: string;
  apiInstance?: any;
  spec?: object | undefined;
  autoConnectApi: boolean;
  cachedMetrics?: Metrics;
  client: KubeClient;

  constructor(
    name: string,
    wsUri: string,
    prometheusUri: string,
    client: KubeClient,
    autoConnectApi = false
  ) {
    this.name = name;
    this.wsUri = wsUri;
    this.prometheusUri = prometheusUri;
    this.autoConnectApi = autoConnectApi;
    this.client = client;
  }

  async connectApi() {
    const provider = new WsProvider(this.wsUri);
    this.apiInstance = await ApiPromise.create({ provider });
  }

  async isUp(timeout = DEFAULT_INDIVIDUAL_TEST_TIMEOUT): Promise<boolean> {
    let limitTimeout;
    try {
      limitTimeout = setTimeout(() => {
        throw new Error(`Timeout(${timeout}s)`);
      }, timeout * 1000);

      await this.apiInstance.rpc.system.name();
      return true;
    } catch (err) {
      console.log(err);
      return false;
    } finally {
      if (limitTimeout) clearTimeout(limitTimeout);
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
          const newPort = await this.client.startPortForwarding(PROMETHEUS_PORT,`Pod/${this.name}`);
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
