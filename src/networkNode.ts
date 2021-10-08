import { ApiPromise, WsProvider } from "@polkadot/api";
import { Metrics, fetchMetrics, getMetricName } from "./metrics";
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
        let limitTimeout;
        try{
            limitTimeout = setTimeout(() => {
                throw new Error(`Timeout(${timeout}s)`);
            }, timeout * 1000 );

            await this.apiInstance.rpc.system.name();
            return true;
        } catch( err ) {
            console.log(err);
            return false;
        } finally {
            if(limitTimeout) clearTimeout(limitTimeout);
        }
    }


    async getMetric(rawmetricName: string, desiredMetricValue: number|null = null, timeout=DEFAULT_INDIVIDUAL_TEST_TIMEOUT): Promise<number> {
        let limitTimeout;
        try {
            limitTimeout = setTimeout(() => {
                throw new Error(`Timeout(${timeout}s)`);
            }, timeout * 1000 );

            if( desiredMetricValue === null || ! this.cachedMetrics ) {
                console.log("reloading cache");
                this.cachedMetrics = await fetchMetrics(this.prometheusUri);
            }
            const metricName = getMetricName(rawmetricName);
            let value = this._getMetric(metricName);
            if( desiredMetricValue === null || desiredMetricValue >= value ) {
                clearTimeout(limitTimeout);
                return value;
            }

            // loop until get the desired value or timeout
            let done = false;
            while (!done) {
                await new Promise((resolve) => setTimeout(resolve, 500));
                // refresh metrics
                this.cachedMetrics = await fetchMetrics(this.prometheusUri);
                value =  this._getMetric(metricName);
                if( desiredMetricValue <= value ) {
                done = true;
                } else {
                    // debug
                    console.log(`current value: ${value}, keep trying...`);
                }
            }

            clearTimeout(limitTimeout);
            return value;
        } catch(err) {
            throw new Error(`Error getting metric: ${rawmetricName}`);
        } finally {
            if(limitTimeout) clearTimeout(limitTimeout);
        }
    }

    _getMetric(metricName: string): number {
        if(!this.cachedMetrics) throw new Error("Metrics not availables");

        // loops over namespaces first
        for( const namespace of Object.keys(this.cachedMetrics)) {
            if( this.cachedMetrics[namespace] && this.cachedMetrics[namespace][metricName] !== undefined ) return this.cachedMetrics[namespace][metricName];
        }
        throw new Error("Metric not found!");
    }

}