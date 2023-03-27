{ self, ... }: {
  perSystem = { config, self', inputs', pkgs, system, ... }:
    let
      # reuse existing ignores to clone source
      cleaned-javascript-src = pkgs.lib.cleanSourceWith {
        src = pkgs.lib.cleanSource ./javascript;
        filter = pkgs.nix-gitignore.gitignoreFilterPure
          (name: type:
            # nix files are not used as part of build
            (type == "regular" && pkgs.lib.strings.hasSuffix ".nix" name)
            == false) [ ./.gitignore ] ./javascript;
      };
    in
    {
      packages = rec {
        # output is something like what npm 'pkg` does, but more sandboxed
        default = pkgs.buildNpmPackage rec {
          # root hash (hash of hashes of each dependnecies)
          # this should be updated on each dependency change (use `prefetch-npm-deps` to get new hash)
          npmDepsHash = "sha256-hsQ7Z0/wU8FPNWeR68N9NnbvW95Ux1gHwk+MoTQYBRE=";

          pname = "zombienet";
          name = pname;
          src = cleaned-javascript-src;
          npmBuildScript = "build";
          npmBuildFlag = "--workspaces";

          # just for safety of mac as it is used here often
          nativeBuildInputs = with pkgs; [
            python3
            nodePackages.node-gyp-build
            nodePackages.node-gyp
          ] ++ pkgs.lib.optional pkgs.stdenv.isDarwin (with pkgs;
            with darwin.apple_sdk.frameworks; [
              Security
              SystemConfiguration
            ]);

          runtimeDeps = with pkgs;
            # these are used behind the scenes
            # can provide nix `devenv` with running podman based kubernetes as process/service  
            [ bash coreutils procps findutils podman kubectl ]
            ++ lib.optional stdenv.isLinux glibc.bin;
          # uncomment if need to debug build
          #npmFlags = "--verbose";

          # unfortunately current fetcher(written in rust) has bugs for workspaes, so this is ugly workaround https://github.com/NixOS/nixpkgs/issues/219673
          postBuild = ''
            echo "Generating `dist` of `workspace`"
            npm run build --workspace=packages/utils          
            npm run build --workspace=packages/orchestrator
          '';
          postInstall = ''
            echo "Copying `dist` of `workspace` to output"
            cp --recursive packages/orchestrator/dist/ $out/lib/node_modules/zombienet/node_modules/@zombienet/orchestrator/dist/
            cp --recursive packages/utils/dist/ $out/lib/node_modules/zombienet/node_modules/@zombienet/utils/dist/
          '';
        };
      };
    };
}
