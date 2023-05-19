{
  description =
    "ZombieNet aim to be a testing framework for substrate based blockchains, providing a simple cli tool that allow users to spawn and test ephemeral Substrate based networks";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/1a6a0923e57d9f41bcc3e2532a7f99943a3fbaeb";
    flake-parts = {
      url = "github:hercules-ci/flake-parts";
    };
  };
  outputs = inputs@{ self, flake-parts, ... }:
    # we used flake-parts to iterate over system and also to ensure nix dev scales
    let
      outputs = (flake-parts.lib.mkFlake { inherit inputs; } {
        imports = [ ./flake-module.nix ];
        systems =
          [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin" ];
      });
    in
    outputs // {
      # conventional injecting so that can access via `pkgs.zombinet` for usage in other flakes
      overlays.default = final: prev: {
        zombienet = outputs.packages.${prev.system};
      };
    };
}