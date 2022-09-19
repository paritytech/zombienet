# Kubernetes requirements

Zombienet should works with any k8s cluster (e.g [GKE](https://cloud.google.com/kubernetes-engine), [docker-desktop](https://docs.docker.com/desktop/kubernetes/), [kind](https://kind.sigs.k8s.io/)) **but** you need to have `kubectl` installed to interact with your cluster.

Also, you need _permission_ to create resources (e.g `namespaces`, `pods` and `cronJobs`) in the target cluster.

## Using `Zombienet` GKE cluster (internally).

Zombienet project has it's own k8s cluster in GCP, to use it please ping _Javier_ (@javier:matrix.parity.io) in element to gain access and steps to use.
