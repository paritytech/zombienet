# What is ZombieNet?

ZombieNet aims to be a testing framework for Substrate based blockchains, providing a simple CLI tool that allowS users to spawn and test ephemeral networks. The assertions used in the tests can include on-chain storage, metrics, logs and custom JS scripts that interact with the chain. To make these easy to define, Zombienet uses a built-in natural language tool to write tests as smoothly as possible.

Internally, it's a JS library designed to run on NodeJS and support different backend providers to run the various blockchain nodes. Currently, Kubernetes, Podman and native are the supported providers.