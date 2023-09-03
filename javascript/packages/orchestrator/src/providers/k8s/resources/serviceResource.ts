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
import { PodSpec, ServiceSpec } from "./types";

export class ServiceResource {
  constructor(private readonly podSpec: PodSpec) {}

  public generateSpec() {
    const ports = this.generatePorts();
    const name = this.podSpec.metadata.name;
    return this.generateServiceSpec(name, ports);
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

  private generateServiceSpec(
    name: string,
    ports: ServiceSpec["spec"]["ports"],
  ): ServiceSpec {
    return {
      apiVersion: "v1",
      kind: "Service",
      metadata: { name },
      spec: {
        selector: { "app.kubernetes.io/instance": name },
        ports,
      },
    };
  }
}
