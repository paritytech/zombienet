import { ChaosSpec, PodSpec } from "./types";

import { DelayNetworkSettings } from "../../../types";

export class ChaosResource {
  name: string | undefined;
  delay: DelayNetworkSettings | undefined;

  constructor(private readonly podSpec: PodSpec) {
    this.name = this.podSpec.metadata.name;
    this.delay = this.podSpec.spec.delay!;
  }

  public generateSpec() {
    if (this.delay!.latency.slice(-2) !== "ms") {
      throw Error(
        "Latency value should include the 'ms' indicator (e.g. '100ms')",
      );
    }

    if (this.delay?.jitter.slice(-2) !== "ms") {
      throw Error(
        "Jitter value should include the 'ms' indicator (e.g. '100ms')",
      );
    }
    return this.generateChaosSpec();
  }

  private generateChaosSpec(): ChaosSpec {
    return {
      apiVersion: "chaos-mesh.org/v1alpha1",
      kind: "NetworkChaos",
      metadata: { name: this.name! },
      spec: {
        selector: { pods: this.name! },
        delay: this.delay!,
      },
    };
  }
}
