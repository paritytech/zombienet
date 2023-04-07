import { envVars, Resources } from "../../../types";

type ContainerResource = Resources["resources"];

export interface VolumeMount {
  name: string;
  mountPath: string;
  readOnly: boolean;
}

export interface Volume {
  name: string;
}

export interface ContainerPort {
  containerPort: number;
  name?: "prometheus" | "rpc-http" | "rpc-ws" | "p2p";
  protocol?: "UDP" | "TCP";
}

export interface Container {
  image: string;
  name: string;
  imagePullPolicy?: "Always";
  volumeMounts?: VolumeMount[];
  ports?: ContainerPort[];
  command: string[];
  args?: string[];
  env?: envVars[];
  resources?: ContainerResource;
}

export interface PodSpec {
  apiVersion: "v1";
  kind: "Pod";
  metadata: {
    name: string;
    labels: {
      "zombie-role": string;
      app: string;
      "app.kubernetes.io/name": string;
      "app.kubernetes.io/instance": string;
      "zombie-ns": string;
    };
    annotations?: {
      "prometheus.io/scrape": "true";
      "prometheus.io/port": string;
    };
  };
  spec: {
    hostname: string;
    restartPolicy: "Never" | "OnFailure";
    containers: Container[];
    initContainers?: Container[];
    volumes?: Volume[];
    securityContext?: {
      fsGroup: number;
      runAsUser: number;
      runAsGroup: number;
    };
  };
}
