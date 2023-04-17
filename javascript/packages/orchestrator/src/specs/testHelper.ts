import path from "path";
import { GenesisNodeKey } from "../chainSpec";

export function stringifyBigInt(obj: any) {
  return JSON.stringify(obj, (_, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
}

export const kusamaPath = path.resolve(
  path.join(__dirname, "./kusama-local.json"),
);
export const wrongKusamaPath = path.resolve(
  path.join(__dirname, "./kusama.json"),
);
export const rococoPath = path.resolve(
  path.join(__dirname, "./rococo-local.json"),
);

export const fakeNode = `{"name":"bob","key":"81b637d8fcd2c6da6359e6963113a1170de795e4b725b84d1e0b4cfd9ec58ce9","accounts":{"seed":"//Bob","mnemonic":"edit vote inhale clerk involve captain guard clever gain possible unit olympic","sr_account":{"address":"5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty","publicKey":"0x8eaf04151687736326c9fea17e25fc5287613693c912909cb226aa4794f26a48"},"sr_stash":{"address":"5HpG9w8EBLe5XCrbczpwq5TSXvedjrBGCwqxK1iQ7qUsSWFc","publicKey":"0xfe65717dad0447d715f660a0a58411de509b42e6efb8375f562f58a554d5860e"},"ed_account":{"address":"5GoNkf6WdbxCFnPdAnYYQyCjAKPJgLNxXwPjwTh6DGg6gN3E","publicKey":"0xd17c2d7823ebf260fd138f2d7e27d114c0145d968b5ff5006125f2414fadae69"},"ec_account":{"publicKey":"0x0390084fdbf27d2b79d26a4f13f0ccd982cb755a661969143c37cbc49ef5b91f27"}},"command":"polkadot","image":"docker.io/parity/polkadot:latest","chain":"rococo-local","validator":true,"args":["-lparachain=debug"],"env":[{"name":"COLORBT_SHOW_HIDDEN","value":"1"},{"name":"RUST_BACKTRACE","value":"FULL"}],"bootnodes":[],"telemetryUrl":"","telemetry":false,"prometheus":true,"overrides":[],"addToBootnodes":false,"zombieRole":"node","imagePullPolicy":"Always","p2pPort":43415,"wsPort":45163,"rpcPort":46529,"prometheusPort":35805,"externalPorts":{"p2pPort":43415,"wsPort":45163,"rpcPort":46529,"prometheusPort":35805},"group":"bob"}`;

export const fakeGenesisKey: GenesisNodeKey = [
  "5HpG9w8EBLe5XCrbczpwq5TSXvedjrBGCwqxK1iQ7qUsSWFc",
  "5HpG9w8EBLe5XCrbczpwq5TSXvedjrBGCwqxK1iQ7qUsSWFc",
  {
    grandpa: "5GoNkf6WdbxCFnPdAnYYQyCjAKPJgLNxXwPjwTh6DGg6gN3E",
    babe: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
    im_online: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
    parachain_validator: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
    authority_discovery: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
    para_validator: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
    para_assignment: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
    beefy: "KWByAN7WfZABWS5AoWqxriRmF5f2jnDqy3rB5pfHLGkY93ibN",
    aura: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
  },
];
export const fakeSession = {
  keys: [
    [
      "5GNJqTPyNqANBkUVMN1LPPrxXnFouWXoe2wNSmmEoLctxiZY",
      "5GNJqTPyNqANBkUVMN1LPPrxXnFouWXoe2wNSmmEoLctxiZY",
      {
        grandpa: "5FA9nQDVg267DEd8m1ZypXLBnvN7SFxYwV7ndqSYGiN9TTpu",
        babe: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
        im_online: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
        para_validator: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
        para_assignment: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
        authority_discovery: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      },
    ],
    [
      "5HpG9w8EBLe5XCrbczpwq5TSXvedjrBGCwqxK1iQ7qUsSWFc",
      "5HpG9w8EBLe5XCrbczpwq5TSXvedjrBGCwqxK1iQ7qUsSWFc",
      {
        grandpa: "5GoNkf6WdbxCFnPdAnYYQyCjAKPJgLNxXwPjwTh6DGg6gN3E",
        babe: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
        im_online: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
        para_validator: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
        para_assignment: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
        authority_discovery: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
      },
    ],
  ],
};
