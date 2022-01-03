import { ApiPromise, WsProvider } from "@polkadot/api";
import { chainUpgrade, chainDummyUpgrade } from "./chain-upgrade";

async function connect(apiUrl: string, types: any): Promise<ApiPromise> {
	const provider = new WsProvider(apiUrl)
	const api = new ApiPromise({ provider, types })
	await api.isReady
	return api
}

export {
    connect,
    chainUpgrade,
	chainDummyUpgrade
}