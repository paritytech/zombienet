{self, ...}: {
  perSystem = {
    config,
    self',
    inputs',
    pkgs,
    system,
    ...
  }: let
    runtimeDeps = with pkgs;
    # these are used behind the scenes
    # can provide nix `devenv` with running podman based kubernetes as process/service
      [bash coreutils procps findutils podman kubectl gcc-unwrapped]
      ++ lib.optional stdenv.isLinux glibc.bin;
    # this change on each change of dependencies, unfortunately this hash not yet automatically updated from SRI of package.lock
    npmDepsHash = "sha256-D9CFiPB2T+jEe2s3jFlLFXOz6tQw8ZLxBtfQayFmoCk=";
    name = (builtins.fromJSON (builtins.readFile ./javascript/package.json)).name;
    # reuse existing ignores to avoid rebuild on accidental changes
    cleaned-javascript-src = pkgs.lib.cleanSourceWith {
      src = pkgs.lib.cleanSource ./javascript;
      filter =
        pkgs.nix-gitignore.gitignoreFilterPure
        (
          name: type: (
            # nix files are not used as part of build
            (pkgs.lib.strings.hasSuffix ".nix" name == false)
            &&
            # not need to validate as part of nix build
            (pkgs.lib.strings.hasSuffix ".husky" name == false)
          )
        )
        [./.gitignore]
        ./javascript;
    };
  in {
    formatter = pkgs.alejandra;
    devShells.default = pkgs.mkShell {
      packages = runtimeDeps;
    };

    packages = rec {
      # output is something like what npm 'pkg` does, but more sandboxed
      default = pkgs.buildNpmPackage rec {
        # generally Node should be same as in CI build config
        # root hash (hash of hashes of each dependnecies)
        # this should be updated on each dependency change (use `prefetch-npm-deps` to get new hash)
        inherit name npmDepsHash runtimeDeps;
        pname = name;
        src = cleaned-javascript-src;
        npmBuildScript = "build";
        npmBuildFlag = "--workspaces";
        # just for safety of mac as it is used here often
        nativeBuildInputs = with pkgs;
          [
            python3
            nodePackages.node-gyp-build
            nodePackages.node-gyp
          ]
          ++ pkgs.lib.optional pkgs.stdenv.isDarwin (with pkgs;
            with darwin.apple_sdk.frameworks; [
              Security
              SystemConfiguration
            ]);

        # write logs only into isolated temp home, instead of any folder
        npmFlags = ["--logs-dir=$HOME" "--verbose" "--legacy-peer-deps"];
        makeCacheWritable = true;
      };
    };
  };
}
