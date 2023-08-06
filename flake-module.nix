{ self, ... }: {
  perSystem = { config, self', inputs', pkgs, system, ... }:
    let
      version = (builtins.fromJSON (builtins.readFile ./javascript/packages/cli/package.json)).version;
      name = "zombienet";
      releases = "https://github.com/paritytech/${name}/releases/download";
      src =
        if pkgs.stdenv.isDarwin then {
          url = "${releases}/v${version}/${name}-macos";
          sha256 = "sha256-piaiv6hFTIZOVZNgo7oooNe+TwRrcNzn4SiT4n1jEBQ=";
        } else
          if system == "aarch64-linux" then {
            url = "${releases}/v${version}/${name}-linux-arm64";
            sha256 = "sha256-tXZt8Q6R8jh/UgdmS2jQf3IWGd4wx3u7tY+etYLIXYg=";
          } else {
            url = "${releases}/v${version}/${name}-linux-x64";
            sha256 = "sha256-uf4eykvGEvqtCBfX4eCQe4f4SpagV4VBYVA4hgBzg1w=";
          };
    in
    {
      packages = rec {
        default = pkgs.stdenv.mkDerivation
          {
            runtimeInputs = with pkgs; [ bash coreutils procps findutils podman kubectl ] ++ lib.optional stdenv.isLinux glibc.bin;
            inherit name;
            src = pkgs.fetchurl src;
            phases = [ "installPhase" "patchPhase" ];
            installPhase = ''
              mkdir -p $out/bin
              cp $src $out/bin/${name}
              chmod +x $out/bin/${name}
            '';
          };
      };
    };
}
