Description: Check that paritydb works without affecting finality lag and block production.
Network: ./0001-upgrade-node.toml
Creds: config


validator-0: reports block height is at least 10 within 120 seconds
# 15 secs to download aprox
validator-0: run ./downloadPolkadot.sh within 200 seconds
validator-0: restart
sleep 20 seconds
validator-0: reports block height is at least 25 within 120 seconds
