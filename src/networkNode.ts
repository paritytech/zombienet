import { ApiPromise, WsProvider } from "@polkadot/api";
import { Metrics, fetchMetrics } from "./metrics";
import { DEFAULT_INDIVIDUAL_TEST_TIMEOUT } from "./configManager";

export interface NetworkNodeInterface {
    name: string;
    wsUri: string;
    prometheusUri: string;
    apiInstance?: ApiPromise;
    spec?: object;
    autoConnectApi: boolean;
}

export class NetworkNode implements NetworkNodeInterface {
    name: string;
    wsUri: string;
    prometheusUri: string;
    apiInstance?: any;
    spec?: object | undefined;
    autoConnectApi: boolean;
    cachedMetrics?: Metrics


    constructor(name: string, wsUri: string, prometheusUri: string, autoConnectApi = false) {
        this.name = name;
        this.wsUri = wsUri;
        this.prometheusUri = prometheusUri;
        this.autoConnectApi = autoConnectApi;

    }

    async connectApi() {
        const provider = new WsProvider(this.wsUri);
        this.apiInstance = await ApiPromise.create({ provider });
    }

    async isUp(timeout=DEFAULT_INDIVIDUAL_TEST_TIMEOUT):Promise<boolean> {
        try{
            const limitTimeout = setTimeout(() => {
                throw new Error(`Timeout(${timeout}s)`);
            }, timeout * 1000 );

            await this.apiInstance.rpc.system.name();
            return true;
        } catch( err ) {
            console.log(err);
            return false;
        }
    }


    async getMetric(metricName: string, desiredMetricValue: number|null = null, timeout=DEFAULT_INDIVIDUAL_TEST_TIMEOUT): Promise<number> {
        const limitTimeout = setTimeout(() => {
            throw new Error(`Timeout(${timeout}s)`);
        }, timeout * 1000 );

        if( desiredMetricValue === null || ! this.cachedMetrics ) this.cachedMetrics = await fetchMetrics(this.prometheusUri);
        let value = this._getMetric(metricName);
        if( desiredMetricValue === null || desiredMetricValue >= value ) return value;

          // loop until get the desired value or timeout
          let done = false;
          while (!done) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            // refresh metrics
            this.cachedMetrics = await fetchMetrics(this.prometheusUri);
            value =  this._getMetric(metricName);
            if( desiredMetricValue >= value ) {
              clearTimeout(limitTimeout);
              done = true;
            }
          }
          return value;
    }

    _getMetric(metricName: string): number {
        if(!this.cachedMetrics) throw new Error("Metrics not availables");

        // loops over namespaces first
        for( const namespace of Object.keys(this.cachedMetrics)) {
            if( this.cachedMetrics[namespace] && this.cachedMetrics[namespace][metricName]) return this.cachedMetrics[namespace][metricName];
        }
        throw new Error("Metric not found!");
    }

}