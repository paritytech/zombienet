import { provider as k8sProvider } from "./k8s"
import { provider as podmanProvider } from "./podman"
import { provider as nativeProvider } from "./native"

export const Providers = new Map()
Providers.set("kubernetes", k8sProvider)
Providers.set("podman", podmanProvider)
Providers.set("native", nativeProvider)
