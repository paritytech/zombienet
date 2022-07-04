export * from "https://deno.land/std@0.146.0/fs/mod.ts"

export function existsSync(path: string): boolean {
  try {
    Deno.lstatSync(path);
    return true;
  } catch(e) {
    if (e instanceof Deno.errors.NotFound) {
      return false;
    }
    throw e;
  }
}