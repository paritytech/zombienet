import {
  DelayNetworkSettings,
  envVars,
  Resources,
  ZombieRoleLabel,
} from "../../../sharedTypes";

type ContainerResource = Resources["resources"];

export interface VolumeMount {
  name: string;
  mountPath: string;
  readOnly: boolean;
}

export interface Volume {
  name: string;
  hostPath?: any;
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

export interface Labels {
  "zombie-role": ZombieRoleLabel;
  app: string;
  "app.kubernetes.io/name": string;
  "app.kubernetes.io/instance": string;
  "x-infra-instance": string;
  "managed-by": string;
}

export interface Annotations {
  "prometheus.io/scrape": "true";
  "prometheus.io/port": string;
}

export interface InnerPodSpec {
  hostname: string;
  restartPolicy: "Never" | "OnFailure" | "Always";
  containers: Container[];
  initContainers?: Container[];
  volumes?: Volume[];
  securityContext?: {
    fsGroup: number;
    runAsUser: number;
    runAsGroup: number;
  };
  delay?: DelayNetworkSettings;
}

export interface PodSpec {
  apiVersion: "v1";
  kind: "Pod";
  metadata: {
    name: string;
    labels: Labels;
    annotations?: Annotations;
  };
  spec: InnerPodSpec;
}

export interface ServiceSpec {
  apiVersion: "v1";
  kind: "Service";
  metadata: { name: string };
  spec: {
    selector: {
      "app.kubernetes.io/instance": string;
    };
    ports: {
      name: string;
      protocol: "TCP" | "UDP";
      port: number;
      targetPort: number;
    }[];
  };
}

export interface ChaosSpec {
  apiVersion: "chaos-mesh.org/v1alpha1";
  kind: "NetworkChaos";
  metadata: { name: string };
  spec: {
    mode: "all";
    action: "delay";
    selector: SelectorTypeNS | SelectorTypePods;
    delay: DelayNetworkSettings;
  };
}

interface SelectorTypeNS {
  namespaces: string[];
}

interface SelectorTypePods {
  pods: {
    [namespace: string]: string[];
  };
}
