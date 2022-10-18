export const LOKI_URL_FOR_NODE =
  "https://grafana.parity-mgmt.parity.io/explore?orgId=1&left=%5B%22{{from}}%22,%22{{to}}%22,%22loki.parity-zombienet%22,%7B%22expr%22:%22%7Bpod%3D~%5C%22{{namespace}}%2F{{podName}}%5C%22%7D%22,%22refId%22:%22A%22,%22range%22:true%7D%5D";
