#!/usr/bin/env bash

set -euxo pipefail

# add /cfg as first `looking dir` to allow to overrides commands.
export PATH="/cfg":$PATH

cd /cfg
curl -L -O https://github.com/paritytech/polkadot/releases/download/v0.9.26/polkadot
chmod +x /cfg/polkadot
echo $(polkadot --version)
