Description: Logs Test
Network: ./0005-logs.toml
Creds: config


alice: is up
bob: is up
alice: reports block height is at least 10 within 20 seconds
alice: log line contains "Imported #12" within 20 seconds
alice: log line matches glob "*rted #1*" within 10 seconds
alice: log line matches "Imported #[0-9]+" within 10 seconds