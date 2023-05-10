// Our address for Alice on the dev chain
const ALICE = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const BOB = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';

export const run = async (nodeName: any, networkInfo: any, args: any) => {
    const {wsUri, userDefinedTypes} = networkInfo.nodesByName[nodeName];
    const api = await zombie.connect(wsUri, userDefinedTypes);

    const acc = args[0] === "alice" ? ALICE : BOB;
    const balance = await api.query.system.account(acc);

    console.log(`Current balances for ${args[0]} is ${balance.data.free}`);
    return balance.data.free;
}
