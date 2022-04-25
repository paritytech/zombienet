Description: Small Network test
Network: ./0001-small-network.toml
Creds: config


# well know functions
alice: is up
bob: is up
alice: parachain 100 is registered within 225 seconds

# metrics
alice: reports node_roles is 4
alice: reports sub_libp2p_is_major_syncing is 0

# histogram
alice: reports histogram polkadot_pvf_execution_time has at least 2 samples in buckets ["0.1", "0.25", "0.5", "+Inf"] within 100 seconds

# logs
bob: log line matches glob "*rted #1*" within 10 seconds
bob: log line matches "Imported #[0-9]+" within 10 seconds

# system events
bob: system event contains "A candidate was included" within 20 seconds
alice: system event matches glob "*was backed*" within 10 seconds
