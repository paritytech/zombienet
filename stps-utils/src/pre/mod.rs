use subxt::{
	sp_core::{sr25519::Pair as SrPair, Pair},
	sp_runtime::AccountId32,
	DefaultConfig, PairSigner,
};

use crate::shared::{connect, Error};

/// Check first and last accounts
pub async fn pre_conditions(node: &str, derivation: &str, n: usize) -> Result<(), Error> {
	let pair_0: SrPair = Pair::from_string(format!("{}{}", derivation, 0).as_str(), None).unwrap();
	let signer_0: PairSigner<DefaultConfig, SrPair> = PairSigner::new(pair_0);
	let account_0 = signer_0.account_id();

	check_account(node, account_0).await?;

	let pair_n: SrPair =
		Pair::from_string(format!("{}{}", derivation, n - 1).as_str(), None).unwrap();
	let signer_n: PairSigner<DefaultConfig, SrPair> = PairSigner::new(pair_n);
	let account_n = signer_n.account_id();

	check_account(node, account_n).await?;

	Ok(())
}

/// Check account nonce and free balance
async fn check_account(node: &str, account: &AccountId32) -> Result<(), Error> {
	let api = connect(node).await?;

	let ext_deposit = api.constants().balances().existential_deposit().unwrap();

	let genesis = 0u32;
	let genesis_hash = api.client.rpc().block_hash(Some(genesis.into())).await?;

	let account_state = api.storage().system().account(account, genesis_hash).await?;

	if account_state.nonce != 0 {
		panic!("Account has non-zero nonce");
	}

	if (account_state.data.free as f32) < ext_deposit as f32 * 1.1
	/* 10% for fees */
	{
		// 10% for fees
		panic!("Account has insufficient funds");
	}

	Ok(())
}
