import { provider as k8sProvider } from "./k8s";
import { provider as nativeProvider } from "./native";
import { provider as podmanProvider } from "./podman";

export const Providers = new Map();
Providers.set("kubernetes", k8sProvider);
Providers.set("podman", podmanProvider);
Providers.set("native", nativeProvider);

export function getProvider(provider: string) {
  if (!Providers.has(provider)) {
    throw new Error(
      "Invalid provider config. You must one of: " +
        Array.from(Providers.keys()).join(", "),
    );
  }

  return Providers.get(provider);
}
