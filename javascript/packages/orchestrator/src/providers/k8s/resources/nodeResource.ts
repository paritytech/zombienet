import { genCmd, genCumulusCollatorCmd } from "../../../cmdGenerator";
import {
  FINISH_MAGIC_FILE,
  P2P_PORT,
  PROMETHEUS_PORT,
  RPC_HTTP_PORT,
  RPC_WS_PORT,
  TRANSFER_CONTAINER_NAME,
  TRANSFER_CONTAINER_WAIT_LOG,
} from "../../../constants";
import { Node, ZombieRole, ZombieRoleLabel } from "../../../sharedTypes";
import {
  Container,
  ContainerPort,
  PodSpec,
  Volume,
  VolumeMount,
} from "./types";

export class NodeResource {
  constructor(
    protected readonly namespace: string,
    protected readonly nodeSetupConfig: Node,
  ) {}

  public async generateSpec(inCI: boolean = false) {
    // DEBUG LOCAL
    inCI = true;
    const volumes = await this.generateVolumes(inCI);
    const volumeMounts = this.generateVolumesMounts(inCI);
    const containersPorts = await this.generateContainersPorts();
    const initContainers = this.generateInitContainers();
    const containers = await this.generateContainers(
      volumeMounts,
      containersPorts,
    );

    return this.generatePodSpec(initContainers, containers, volumes, inCI);
  }

  private async generateVolumes(inCI: boolean): Promise<Volume[]> {
    const volumes: Volume[] = [
      { name: "tmp-cfg" },
      { name: "tmp-data" },
      { name: "tmp-relay-data" },
    ];

    if (inCI)
      volumes.push({
        name: "pods",
        hostPath: { path: "/var/log/pods", type: "" },
      });

    return volumes;
  }

  private generateVolumesMounts(inCI: boolean) {
    const volMount = [
      { name: "tmp-cfg", mountPath: "/cfg", readOnly: false },
      { name: "tmp-data", mountPath: "/data", readOnly: false },
      { name: "tmp-relay-data", mountPath: "/relay-data", readOnly: false },
    ];

    if (inCI)
      volMount.push({
        name: "pods",
        mountPath: "/var/log/pods",
        readOnly: true /* set to false for debugging */,
      });
    return volMount;
  }

  private async generateContainersPorts(): Promise<ContainerPort[]> {
    return [
      { containerPort: PROMETHEUS_PORT, name: "prometheus" },
      { containerPort: RPC_HTTP_PORT, name: "rpc-http" },
      { containerPort: RPC_WS_PORT, name: "rpc-ws" },
      { containerPort: P2P_PORT, name: "p2p" },
    ];
  }

  private generateContainerCommand(): Promise<string[]> {
    if (this.nodeSetupConfig.zombieRole === ZombieRole.CumulusCollator) {
      return genCumulusCollatorCmd(this.nodeSetupConfig);
    }

    return genCmd(this.nodeSetupConfig);
  }

  private generateInitContainers(): Container[] {
    return [
      {
        name: TRANSFER_CONTAINER_NAME,
        image:
          "europe-west3-docker.pkg.dev/parity-zombienet/zombienet-public-images/alpine:latest",
        imagePullPolicy: "Always",
        volumeMounts: [
          { name: "tmp-cfg", mountPath: "/cfg", readOnly: false },
          { name: "tmp-data", mountPath: "/data", readOnly: false },
          { name: "tmp-relay-data", mountPath: "/relay-data", readOnly: false },
        ],
        command: [
          "ash",
          "-c",
          [
            "cp /tmp/curl /cfg/curl",
            "chmod +x /cfg/curl",
            "cp /tmp/coreutils /cfg/coreutils",
            "chmod +x /cfg/coreutils",
            `until [ -f ${FINISH_MAGIC_FILE} ]; do echo ${TRANSFER_CONTAINER_WAIT_LOG}; sleep 1; done; echo copy files has finished`,
          ].join(" && "),
        ],
      },
    ];
  }

  private shouldAddJaegerContainer() {
    const { zombieRole, jaegerUrl } = this.nodeSetupConfig;
    const isNodeOrCumulusCollator = [
      ZombieRole.Node,
      ZombieRole.CumulusCollator,
    ].includes(zombieRole);
    const isJaegerUrlDefined = jaegerUrl && jaegerUrl === "localhost:6831";

    return isNodeOrCumulusCollator && isJaegerUrlDefined;
  }

  private generateJaegerContainer(): Container {
    return {
      name: "jaeger-agent",
      image: "jaegertracing/jaeger-agent:1.28.0",
      ports: [
        { containerPort: 5775, protocol: "UDP" },
        { containerPort: 5778, protocol: "TCP" },
        { containerPort: 6831, protocol: "UDP" },
        { containerPort: 6832, protocol: "UDP" },
      ],
      command: [
        "/go/bin/agent-linux",
        "--reporter.type=grpc",
        "--reporter.grpc.host-port=tempo-tempo-distributed-distributor.tempo.svc.cluster.local:14250",
      ],
      resources: {
        limits: { memory: "50M", cpu: "100m" },
        requests: { memory: "50M", cpu: "100m" },
      },
    };
  }

  private async generateContainers(
    volumeMounts: VolumeMount[],
    ports: ContainerPort[],
  ): Promise<Container[]> {
    const { image, name, env, resources } = this.nodeSetupConfig;
    const containers: Container[] = [
      {
        image,
        name,
        imagePullPolicy: "IfNotPresent",
        ports,
        env,
        volumeMounts,
        command: await this.generateContainerCommand(),
        resources: resources?.resources,
      },
    ];

    if (this.shouldAddJaegerContainer()) {
      containers.push(this.generateJaegerContainer());
    }

    return containers;
  }

  private computeZombieRoleLabel(): ZombieRoleLabel {
    const { validator, zombieRole } = this.nodeSetupConfig;

    if (zombieRole) {
      return zombieRole;
    }

    return validator ? "authority" : "full-node";
  }

  protected generatePodSpec(
    initContainers: Container[],
    containers: Container[],
    volumes: Volume[],
    inCI: boolean = false,
  ): PodSpec {
    const { name, zombieRole } = this.nodeSetupConfig;
    const zombieRoleLabel = this.computeZombieRoleLabel();
    const restartPolicy = zombieRole === ZombieRole.Temp ? "Never" : "Always";

    return {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name,
        labels: {
          "zombie-role": zombieRoleLabel,
          app: "zombienet",
          "app.kubernetes.io/name": this.namespace,
          "app.kubernetes.io/instance": name,
          "x-infra-instance": process.env.X_INFRA_INSTANCE || "ondemand",
        },
        annotations: {
          "prometheus.io/scrape": "true",
          "prometheus.io/port": `${PROMETHEUS_PORT}`,
        },
      },
      spec: {
        hostname: name,
        containers,
        initContainers,
        restartPolicy,
        volumes,
        securityContext: {
          fsGroup: inCI ? 0 : 1000,
          runAsUser: 1000,
          runAsGroup: 1000,
        },
      },
    };
  }
}
