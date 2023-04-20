// Check if the testnet's name is the same as the expected name from the args
async function run(nodeName, networkInfo, args) {
    const {wsUri, userDefinedTypes} = networkInfo.nodesByName[nodeName];
    const api = await zombie.connect(wsUri, userDefinedTypes);

    const expectedName = args[0] ?? "Rococo Local Testnet";
    const testnetName = await api.rpc.system.chain();

    return testnetName == expectedName ? 1 : 0;
}

module.exports = { run }