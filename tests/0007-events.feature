Description: System Events Test
Network: ./0007-events.toml
Creds: config


alice: is up
bob: is up
alice: reports block height is at least 10 within 200 seconds
alice: system event contains "A candidate was included" within 20 seconds
alice: system event matches glob "*was backed*" within 10 seconds
alice: system event matches "paraId:[0-9]+" within 10 seconds