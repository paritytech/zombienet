import { provider as k8sProvider } from "./k8s/index.ts";
import { provider as podmanProvider } from "./podman/index.ts";
import { provider as nativeProvider } from "./native/index.ts";

export const Providers = new Map();
Providers.set("kubernetes", k8sProvider);
Providers.set("podman", podmanProvider);
Providers.set("native", nativeProvider);
