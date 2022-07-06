import { assert } from "../../_deps/asserts.ts"

export function getEnvSafe(key: string): string {
  const val = Deno.env.get(key);
  assert(val);
  return val;
}
