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
    npmDepsHash = "sha256-Asc9yyOORJxgySz+ZhKgWzGQfZd7GpjBhhjN4wQztek=";
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
      packages = runtimeDeps ++ [self'.packages.default];
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

      update = pkgs.writeShellApplication {
        name = "update";
        runtimeInputs = [pkgs.prefetch-npm-deps];
        text = ''
          prefetch-npm-deps ./javascript/package-lock.json
        '';
      };
      polkadot = pkgs.stdenv.mkDerivation rec {
        name = "polkadot";
        pname = name;
        src = self.inputs.polkadot;
        phases = ["installPhase"];
        installPhase = ''
          mkdir -p $out/bin
          cp $src $out/bin/${name}
          chmod +x $out/bin/${name}
        '';
      };
      polkadot-parachain = pkgs.stdenv.mkDerivation rec {
        name = "polkadot-parachain";
        pname = name;
        src = self.inputs.polkadot-parachain;
        phases = ["installPhase"];
        installPhase = ''
          mkdir -p $out/bin
          cp $src $out/bin/${name}
          chmod +x $out/bin/${name}
        '';
      };
      example = let
        config = {
          settings = {
            timeout = 2000;
          };
          relaychain = {
            command = "polkadot";
            chain = "rococo-local";
            nodes = [
              {name = "alice";}
              {name = "bob";}
            ];
            ws_port = 9944;
          };
          parachains = [
            {
              id = 1002;
              chain = "contracts-rococo-dev";
              collator = {
                name = "contracts";
                command = "polkadot-parachain";
                ws_port = 9988;
                args = ["-lparachain=debug"];
              };
            }
          ];
        };
      in
        pkgs.writeShellApplication rec {
          name = "example";
          runtimeInputs = [default polkadot polkadot-parachain];
          text = ''
            printf '${
              builtins.toJSON config
            }' > /tmp/zombie-${name}.json
            zombienet spawn /tmp/zombie-${name}.json --provider native
          '';
        };
    };
  };
}
