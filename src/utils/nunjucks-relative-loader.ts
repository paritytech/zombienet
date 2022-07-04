import { ILoader } from "nunjucks";

export class RelativeLoader implements ILoader {
  constructor(private paths: string[]) {}
  getSource(name: string) {
    const fullPath = require.resolve(name, {
      paths: this.paths,
    });

    return {
      src: Deno.readTextFileSync(fullPath),
      path: fullPath,
      noCache: true,
    };
  }
}
