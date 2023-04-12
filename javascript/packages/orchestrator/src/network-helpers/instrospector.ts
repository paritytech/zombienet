import {
  INTROSPECTOR_POD_NAME,
  INTROSPECTOR_PORT,
  LOCALHOST,
  METRICS_URI_PATTERN,
  RPC_HTTP_PORT,
  WS_URI_PATTERN,
} from "../constants";
import { NetworkNode } from "../networkNode";
import { Client } from "../providers/client";

export async function spawnIntrospector(
  client: Client,
  node: NetworkNode,
  inCI = false,
): Promise<NetworkNode> {
  const [nodeIp, port] = await client.getNodeInfo(node.name, RPC_HTTP_PORT);
  const wsUri = WS_URI_PATTERN.replace("{{IP}}", nodeIp).replace(
    "{{PORT}}",
    port.toString(),
  );
  await client.spawnIntrospector(wsUri);

  const IP = inCI ? await client.getNodeIP(INTROSPECTOR_POD_NAME) : LOCALHOST;
  const PORT = inCI
    ? INTROSPECTOR_PORT
    : await client.startPortForwarding(
        INTROSPECTOR_PORT,
        INTROSPECTOR_POD_NAME,
      );

  // TODO: create a new kind `companion`
  return new NetworkNode(
    INTROSPECTOR_POD_NAME,
    "",
    METRICS_URI_PATTERN.replace("{{IP}}", IP).replace(
      "{{PORT}}",
      PORT.toString(),
    ),
    "",
  );
}
