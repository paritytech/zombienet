// Get a live chain's system balances on the URL provided with `pullFrom`, and 
// insert them into a raw spec to launch a new chain with.
//
// ### Arguments
// - `rawSpec`: Path to the raw chain spec to modify
// - `pullFrom`: URL of the chain's WS port to get the data from
// 
// ### Usage
// `chainql --tla-code=rawSpec="import '/path/to/parachain-spec-raw.json'" --tla-str=pullFrom="wss://some-parachain.node:443" chainqlCopyBalances.jsonnet`
//
// Make sure to to have `chainql` installed: `cargo install chainql`

function(rawSpec, pullFrom)
// get the latest state of the blockchain
local sourceChainState = cql.chain(pullFrom).latest;

local
	// store all keys under the `Account` storage of the `System` pallet
	accounts = sourceChainState.System.Account._preloadKeys,
	// get the encoded naming of `pallet_balances::TotalIssuance` for future use
	totalIssuanceKey = sourceChainState.Balances._encodeKey.TotalIssuance([]),
;

// output the raw spec with the following changes
rawSpec {
	genesis+: {
		raw+: {
			// add the following entries to the `top` section
			top+: 
			{
				// encode key and value of every account under `system.account` and add them to the chain spec
				[sourceChainState.System._encodeKey.Account([key])]: 
					sourceChainState.System._encodeValue.Account(accounts[key])
				for key in std.objectFields(accounts)
			} + {
				// add to the local, already-existing total issuance the issuance of all incoming accounts.
				// NOTE: we do not take into consideration for total issuance's funds potential overlap with the testnet's present accounts.
				[totalIssuanceKey]: sourceChainState.Balances._encodeValue.TotalIssuance(
					// decode the chain-spec's already existing totalIssuance
					sourceChainState.Balances._decodeValue.TotalIssuance(super[totalIssuanceKey])
					// iterate over and sum up the total issuance of the incoming accounts
					+ std.foldl(
						function(issuance, acc)
							issuance + acc.data.free + acc.data.reserved
						,
						std.objectValues(accounts),
						std.bigint('0'),
					)
				)
			},
		},
	},
}