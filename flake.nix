{
  description =
    "ZombieNet aim to be a testing framework for substrate based blockchains, providing a simple cli tool that allow users to spawn and test ephemeral Substrate based networks";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts = {
      url = "github:hercules-ci/flake-parts";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };
  outputs = inputs@{ self, nixpkgs, flake-parts, ... }:
    # we used flake-parts to iterate over system and also to ensure nix dev scales
    (flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [ ./flake-module.nix ];
      systems =
        [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin" ];
    });

}
