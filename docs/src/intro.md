# What is ZombieNet?

ZombieNet aim to be a testing framework for substrate based blockchains, providing a simple cli tool that allow users to spawn and test ephemeral networks. The assertions using in the tests can include on-chain storage, metrics, logs and custom javascript scripts that interact with the chain. To make easy to define those zombienet has a set of natural languaje built-in allowing to write test as smooth as posible.

Internally is a javascript library, designed to run on NodeJS and support different backend providers to run the nodes, at this moment kubernetes, podman and native are supported.