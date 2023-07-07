import {
  JAEGER_AGENT_SERVE_CONFIGS_PORT,
  JAEGER_AGENT_THRIFT_BINARY_PORT,
  JAEGER_AGENT_THRIFT_COMPACT_PORT,
  JAEGER_AGENT_ZIPKIN_COMPACT_PORT,
  P2P_PORT,
  PROMETHEUS_PORT,
  RPC_HTTP_PORT,
  RPC_WS_PORT,
} from "../../../constants";
import { BadNetworkSettings, ChaosSpec, PodSpec, ServiceSpec } from "./types";

export class ChaosResource {
  constructor(private readonly podSpec: PodSpec) {}

  public generateSpec() {
    const ports = this.generatePorts();
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
    return this.generateChaosSpec(name, ports, delay);
  }

  private shouldExposeJaegerPorts(): boolean {
    return this.podSpec.spec.containers.some(
      (container) => container.name === "jaeger-agent",
    );
  }

  private generatePorts(): ServiceSpec["spec"]["ports"] {
    let ports: ServiceSpec["spec"]["ports"] = [
      {
        name: "prometheus",
        protocol: "TCP",
        port: PROMETHEUS_PORT,
        targetPort: PROMETHEUS_PORT,
      },
      {
        name: "rpc-http",
        protocol: "TCP",
        port: RPC_HTTP_PORT,
        targetPort: RPC_HTTP_PORT,
      },
      {
        name: "rpc-ws",
        protocol: "TCP",
        port: RPC_WS_PORT,
        targetPort: RPC_WS_PORT,
      },
      {
        name: "p2p",
        protocol: "TCP",
        port: P2P_PORT,
        targetPort: P2P_PORT,
      },
    ];

    if (this.shouldExposeJaegerPorts()) {
      ports = ports.concat([
        {
          name: "jaeger-agent-zipkin-compact",
          protocol: "UDP",
          port: JAEGER_AGENT_ZIPKIN_COMPACT_PORT,
          targetPort: JAEGER_AGENT_ZIPKIN_COMPACT_PORT,
        },
        {
          name: "jaeger-agent-serve-configs",
          protocol: "TCP",
          port: JAEGER_AGENT_SERVE_CONFIGS_PORT,
          targetPort: JAEGER_AGENT_SERVE_CONFIGS_PORT,
        },
        {
          name: "jaeger-agent-thrift-compact",
          protocol: "UDP",
          port: JAEGER_AGENT_THRIFT_COMPACT_PORT,
          targetPort: JAEGER_AGENT_THRIFT_COMPACT_PORT,
        },
        {
          name: "jaeger-agent-thrift-binary",
          protocol: "UDP",
          port: JAEGER_AGENT_THRIFT_BINARY_PORT,
          targetPort: JAEGER_AGENT_THRIFT_BINARY_PORT,
        },
      ]);
    }

    return ports;
  }

  private generateChaosSpec(
    name: string,
    ports: ChaosSpec["spec"]["ports"],
    delay: BadNetworkSettings,
  ): ChaosSpec {
    return {
      apiVersion: "chaos-mesh.org/v1alpha1",
      kind: "NetworkChaos",
      metadata: { name },
      spec: {
        selector: { namespaces: name },
        ports,
        delay,
      },
    };
  }
}
