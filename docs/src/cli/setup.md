# Setup

This command will help you to easily download latest artifacts and make them executablein order to use them with zombienet

## Download and install needed artifacts

For easier and faster setup of local environment, upi can run:

```bash
❯ zombienet setup

Setup is meant for downloading and making everything ready for dev environment of ZombieNet;

You can use the following arguments:
  binaries    the binaries that you want to be downloaded, provided in a row without any separators;
              They are downloaded in current directory and appropriate executable permissions are assigned.
              Possible options: 'polkadot', 'polkadot-parachain'
              > zombienet setup polkadot polkadot-parachain

```

Script above will retrieve the binaries provided and try to download and prepare those binaries for usage. At the end of the download, script will provide a command to run in your local environment in order to add the directory where the binaries were downloaded in your $PATH var:

e.g.

```bash
Please add the dir to your $PATH by running the command: export PATH=/home/<user>/current_directory:$PATH
```

Command example:

```bash
➜ zombienet setup polkadot polkadot-parachain
```

Output example:

```bash
Setup will start to download binaries:
- polkadot 	 Approx. size  113  MB
- polkadot-parachain 	 Approx. size  120  MB
Total approx. size:  233 MB
Do you want to continue? (y/n)y

Start download...

-> downloading [========================================] 100% 0.0s
Binary "polkadot-parachain" downloaded
Giving permissions to "polkadot-parachain"
-> downloading [========================================] 100% 0.0s
Binary "polkadot" downloaded
Giving permissions to "polkadot"
Please add the dir to your $PATH by running the command:
 export PATH=/home/<username>/zombienet/dist:$PATH
```
