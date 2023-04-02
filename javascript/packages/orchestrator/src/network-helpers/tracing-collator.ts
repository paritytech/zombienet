import { decorators } from "@zombienet/utils";
import {
  TRACING_COLLATOR_NAMESPACE,
  TRACING_COLLATOR_PODNAME,
  TRACING_COLLATOR_PORT,
  TRACING_COLLATOR_SERVICE,
} from "../constants";
import { Network } from "../network";
import { Client } from "../providers/client";
import { PodmanClient } from "../providers/podman/podmanClient";
import { ComputedNetwork } from "../types";

export async function setTracingCollatorConfig(
  networkSpec: ComputedNetwork,
  network: Network,
  client: Client,
): Promise<void> {
  const {
    tracing_collator_url,
    tracing_collator_service_port,
    tracing_collator_service_name,
    tracing_collator_service_namespace,
  } = networkSpec.settings;
  if (tracing_collator_url) network.tracing_collator_url = tracing_collator_url;
  else {
    const servicePort = tracing_collator_service_port || TRACING_COLLATOR_PORT;
    switch (client.providerName) {
      case "kubernetes":
        // check if we have the service available
        const serviceName =
          tracing_collator_service_name || TRACING_COLLATOR_SERVICE;
        const serviceNamespace =
          tracing_collator_service_namespace || TRACING_COLLATOR_NAMESPACE;
        // check if service exists
        let serviceExist;
        try {
          await client.runCommand([
            "get",
            "service",
            serviceName,
            "-n",
            serviceNamespace,
          ]);
          serviceExist = true;
        } catch (_) {
          console.log(
            decorators.yellow(
              `\n\t Warn: Tracing collator service doesn't exist`,
            ),
          );
        }

        if (serviceExist) {
          try {
            const tracingPort = await client.startPortForwarding(
              servicePort,
              `service/${serviceName}`,
              serviceNamespace,
            );
            network.tracing_collator_url = `http://localhost:${tracingPort}`;
          } catch (_) {
            console.log(
              decorators.yellow(
                `\n\t Warn: Can not create the forwarding to the tracing collator`,
              ),
            );
          }
        }
        break;
      case "podman":
        const tracingPort = await (client as PodmanClient).getPortMapping(
          servicePort,
          TRACING_COLLATOR_PODNAME,
        );
        network.tracing_collator_url = `http://localhost:${tracingPort}`;
        break;
    }
  }
}
