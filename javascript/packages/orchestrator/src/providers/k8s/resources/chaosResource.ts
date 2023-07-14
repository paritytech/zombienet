import { ChaosSpec, PodSpec } from "./types";

import { BadNetworkSettings } from "../../../types";

export class ChaosResource {
  constructor(private readonly podSpec: PodSpec) {}

  public generateSpec() {
    const name = this.podSpec.metadata.name;
    const delay = this.podSpec.spec.delay!;

    if (delay.latency.slice(-2) !== "ms") {
      throw Error(
        "Latency value should include the 'ms' indicator (e.g. '100ms')",
      );
    }

    if (delay?.jitter.slice(-2) !== "ms") {
      throw Error(
        "Jitter value should include the 'ms' indicator (e.g. '100ms')",
      );
    }
    return this.generateChaosSpec(name, delay);
  }

  private shouldExposeJaegerPorts(): boolean {
    return this.podSpec.spec.containers.some(
      (container) => container.name === "jaeger-agent",
    );
  }

  private generateChaosSpec(
    name: string,
    delay: BadNetworkSettings,
  ): ChaosSpec {
    return {
      apiVersion: "chaos-mesh.org/v1alpha1",
      kind: "NetworkChaos",
      metadata: { name },
      spec: {
        selector: { pods: name },
        delay,
      },
    };
  }
}
