import { envVars } from "../../../types";

export interface VolumeMount {
  name: string;
  mountPath: string;
  readOnly: boolean;
}

export interface Volume {
  name: string;
  hostPath: {
    type: "Directory";
    path: string;
  };
}

export interface ContainerPort {
  containerPort: number;
  name:
    | "prometheus"
    | "prometheus_endpoint"
    | "grafana_web"
    | "rpc"
    | "rpc-ws"
    | "p2p"
    | "tempo"
    | "jaeger_ingest"
    | "otlp_grpc"
    | "otlp_http"
    | "zipkin";
  hostPort: number;
}

export interface Container {
  image: string;
  name: string;
  imagePullPolicy: "Always";
  volumeMounts: VolumeMount[];
  ports: ContainerPort[];
  command?: string[];
  args?: string[];
  env?: envVars[];
}

export interface PodSpec {
  apiVersion: "v1";
  kind: "Pod";
  metadata: {
    name: string;
    namespace: string;
    labels: {
      "zombie-role": string;
      app: string;
      "zombie-ns": string;
    };
    annotations?: {
      "prometheus.io/scrape": "true";
      "prometheus.io/port": string;
    };
  };
  spec: {
    hostname: string;
    restartPolicy: "OnFailure";
    containers: Container[];
    initContainers?: Container[];
    volumes?: Volume[];
  };
}
