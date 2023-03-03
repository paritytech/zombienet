{ self, ... }: {
  perSystem = { config, self', inputs', pkgs, system, ... }:
    let
      # reuse existing ignores to clone source
      cleaned-javascript-src = pkgs.lib.cleanSourceWith {
        src = pkgs.lib.cleanSource ./javascript;
        filter = pkgs.nix-gitignore.gitignoreFilterPure (name: type:
          # nix files are not used as part of build
          (type == "regular" && pkgs.lib.strings.hasSuffix ".nix" name)
          == false)
          [ ./.gitignore ] ./javascript;
      };
    in {
      packages = rec {
        default = pkgs.buildNpmPackage rec {
          pname = "zombienet";
          name = pname;
          src = cleaned-javascript-src;
          npmBuildScript = "build";
          npmBuildFlag = "--workspaces";
          runtimeDeps = with pkgs;
          # these are used behind the scenes
          # can provide devenv with running podman based kubernetes too 
            [ bash coreutils procps findutils podman kubectl ]
            ++ lib.optional stdenv.isLinux glibc.bin;
          # uncomment if need to debug build
          #npmFlags = "--verbose";

          npmDepsHash = "sha256-DPu99IM0dRT8B0+FqG2mN/BMea61/uNvNvmvjAypC08=";
          # unfortunately current fetcher(written in rust) has bugs for workspaes, so this is ugly workaround, creating issue on nixpkgs
          preInstall = ''
            echo "Generating `dist` of `workspace`"
            npm run build --workspace=packages/utils          
            npm run build --workspace=packages/orchestrator
            npm run build --workspace=packages/cli
          '';
          postInstall = ''
            echo "Copying `dist` of `workspace` to output"
            cp --recursive packages/orchestrator/dist/ $out/lib/node_modules/zombienet/node_modules/@zombienet/orchestrator/dist/
            cp --recursive packages/orchestrator/dist/ $out/lib/node_modules/zombienet/node_modules/@zombienet/orchestrator/dist/
            cp --recursive packages/utils/dist/ $out/lib/node_modules/zombienet/packages/utils/dist/
            cp --recursive packages/utils/dist/ $out/lib/node_modules/zombienet/packages/utils/dist/
          '';
        };
      };
    };
}
