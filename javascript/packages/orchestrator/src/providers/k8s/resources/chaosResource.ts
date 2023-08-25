import { ChaosSpec } from "./types";

import { DelayNetworkSettings } from "../../../sharedTypes";

export class ChaosResource {
  constructor(
    protected readonly name: string,
    protected readonly namespace: string,
    protected readonly delay: DelayNetworkSettings,
  ) {}

  public generateSpec() {
    if (this.delay.latency.slice(-2) !== "ms") {
      throw Error(
        "Latency value should include the 'ms' indicator (e.g. '100ms')",
      );
    }

    if (this.delay.jitter && this.delay.jitter.slice(-2) !== "ms") {
      throw Error(
        "Jitter value should include the 'ms' indicator (e.g. '100ms')",
      );
    }

    if (this.delay.correlation) {
      const correlation = parseFloat(this.delay.correlation);
      if (Number.isNaN(correlation)) {
        throw Error(
          "Correlation value should parsable as Float by k8s api (e.g. '100')",
        );
      } else {
        this.delay.correlation = correlation.toString();
      }
    } else {
      // set default correlation (100)
      this.delay.correlation = "100";
    }
    return this.generateChaosSpec();
  }

  private generateChaosSpec(): ChaosSpec {
    return {
      apiVersion: "chaos-mesh.org/v1alpha1",
      kind: "NetworkChaos",
      metadata: { name: this.name },
      spec: {
        mode: "all",
        action: "delay",
        selector: {
          pods: {
            [this.namespace]: [this.name],
          },
        },
        delay: this.delay,
      },
    };
  }
}
