Description: System Events Custom JS
Network: ./0008-custom-js.toml
Creds: config


alice: is up
bob: is up
#alice: reports block height is at least 10 within 200 seconds
alice: js-script ./0008-custom.js return is greater than 1 within 200 seconds
