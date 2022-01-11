import { ApiPromise, WsProvider } from "@polkadot/api";
import { chainUpgrade, chainDummyUpgrade, validateRuntimeCode } from "./chain-upgrade";
import { paraGetBlockHeight, paraIsRegistered } from "./parachain";

async function connect(apiUrl: string, types: any): Promise<ApiPromise> {
	const provider = new WsProvider(apiUrl)
	const api = new ApiPromise({ provider, types })
	await api.isReady
	return api
}

export {
    connect,
    chainUpgrade,
	chainDummyUpgrade,
	validateRuntimeCode,
	paraGetBlockHeight,
	paraIsRegistered
}