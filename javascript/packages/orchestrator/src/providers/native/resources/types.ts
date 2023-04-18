import { Node, ZombieRoleLabel } from "../../../types";

export interface ProcessEnvironment {
  [key: string]: string;
}

export type PortProperty = keyof NonNullable<Node["externalPorts"]>;

export interface Port {
  containerPort: number;
  name: "prometheus" | "rpc" | "rpc-ws" | "p2p";
  flag: string;
  hostPort: number;
}

export interface NodeSpec {
  metadata: {
    name: string;
    namespace: string;
    labels: {
      "zombie-role": ZombieRoleLabel;
      app: "zombienet";
      "zombie-ns": string;
      name: string;
      instance: string;
    };
  };
  spec: {
    cfgPath: string;
    dataPath?: string;
    ports: Port[];
    command: string[];
    env: ProcessEnvironment;
  };
}
