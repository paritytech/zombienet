{ self, ... }: {
  perSystem = { config, self', inputs', pkgs, system, ... }:
    let
# <<<<<<< HEAD
#       version = (builtins.fromJSON (builtins.readFile ./javascript/packages/cli/package.json)).version;
#       name = "zombienet";
#       releases = "https://github.com/paritytech/${name}/releases/download";
#       src =
#         if pkgs.stdenv.isDarwin then {
#           url = "${releases}/v${version}/${name}-macos";
#           sha256 = "sha256-piaiv6hFTIZOVZNgo7oooNe+TwRrcNzn4SiT4n1jEBQ=";
#         } else
#           if system == "aarch64-linux" then {
#             url = "${releases}/v${version}/${name}-linux-arm64";
#             sha256 = "sha256-tXZt8Q6R8jh/UgdmS2jQf3IWGd4wx3u7tY+etYLIXYg=";
#           } else {
#             url = "${releases}/v${version}/${name}-linux-x64";
#             sha256 = "sha256-uf4eykvGEvqtCBfX4eCQe4f4SpagV4VBYVA4hgBzg1w=";
#           };
#     in
#     {
#       packages = rec {
#         default = pkgs.stdenv.mkDerivation
#           {
#             runtimeInputs = with pkgs; [ bash coreutils procps findutils podman kubectl ] ++ lib.optional stdenv.isLinux glibc.bin;
#             inherit name;
#             src = pkgs.fetchurl src;
#             phases = [ "installPhase" "patchPhase" ];
#             installPhase = ''
#               mkdir -p $out/bin
#               cp $src $out/bin/${name}
#               chmod +x $out/bin/${name}
#             '';
#           };
# =======
      # reuse existing ignores to clone source
      cleaned-javascript-src = pkgs.lib.cleanSourceWith {
        src = pkgs.lib.cleanSource ./javascript;
        filter = pkgs.nix-gitignore.gitignoreFilterPure
          (name: type:
            (
              # nix files are not used as part of build
              (pkgs.lib.strings.hasSuffix ".nix" name == false)
              &&
              # not need to validate as part of nix build
              (pkgs.lib.strings.hasSuffix ".husky" name == false)
            )
          )
          [ ./.gitignore ] ./javascript;
      };
    in
    {
      packages = rec {
        # output is something like what npm 'pkg` does, but more sandboxed
        default = pkgs.buildNpmPackage rec {
          # generally Node should be same as in CI build config
          # root hash (hash of hashes of each dependnecies)
          # this should be updated on each dependency change (use `prefetch-npm-deps` to get new hash)
          npmDepsHash = "sha256-4UfKtlvGvYMa1UCQSOfS7KQTNwCZjxLZD9pfjEe7C1k=";
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
            [ bash coreutils procps findutils podman kubectl gcc-unwrapped ]
            ++ lib.optional stdenv.isLinux glibc.bin;
          # write logs only into isolated temp home, instead of any folder
          npmFlags = [ "--logs-dir=$HOME" "--verbose" "--legacy-peer-deps" ];

          # unfortunately current fetcher(written in rust) has bugs for workspaes, so this is ugly workaround https://github.com/NixOS/nixpkgs/issues/219673
          preBuild = ''
            patchShebangs packages
          '';
          makeCacheWritable = true;
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