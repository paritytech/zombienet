{
  description = "ZombieNet aim to be a testing framework for substrate based blockchains, providing a simple cli tool that allow users to spawn and test ephemeral Substrate based networks";
  inputs = {
    # follow official nixpkgs release so that likely one already have the required dependencies in store
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-23.11";
    flake-parts = {
      url = "github:hercules-ci/flake-parts";
    };
    process-compose = {
      url = "github:Platonic-Systems/process-compose-flake";
    };
  };
  outputs = inputs @ {
    self,
    flake-parts,
    ...
  }:
  # we used flake-parts to iterate over system and also to ensure nix dev scales
  let
    outputs = flake-parts.lib.mkFlake {inherit inputs;} {
      imports = [
        inputs.process-compose.flakeModule
        ./flake-module.nix
      ];
      systems = ["x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin"];
    };
  in
    outputs
    // {
      # conventional injecting so that can access via `pkgs.zombienet` for usage in other flakes
      overlays.default = final: prev: {
        zombienet = outputs.packages.${prev.system};
      };
    };
}
