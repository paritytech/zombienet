import { provider as k8sProvider } from "./k8s";
import { provider as podmanProvider } from "./podman";

export const Providers = new Map();
Providers.set("Kubernetes", k8sProvider);
Providers.set("Podman", podmanProvider);