use clap::Parser;
use log::*;
use std::path::PathBuf;

mod funder;
mod pre;
mod sender;
mod shared;
mod tps;

use shared::Error;

#[derive(Parser)]
struct Cli {
	#[clap(subcommand)]
	command: Commands,
}

#[derive(clap::Subcommand)]
enum Commands {
	/// Generate the JSON file to be used with Zombienet.
	FundAccountsJson(FundAccountsJsonArgs),
	/// Send many `Balance::transfer_keep_alive` to a node.
	SendBalanceTransfers(SendBalanceTransfersArgs),
	/// Check pre-conditions (account nonce and free balance).
	CheckPreConditions(CheckPreConditionsArgs),
	/// Calculate TPS on finalized blocks
	CalculateTPS(CalculateTPSArgs),
}

const DEFAULT_FUNDED_JSON_PATH: &str = "tests/stps/funded-accounts.json";
const DEFAULT_DERIVATION: &str = "//Sender/";

#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
struct FundAccountsJsonArgs {
	/// The number of accounts to fund
	#[clap(short, default_value_t = 500000)]
	n: usize,

	/// Path to write the funded accounts to.
	#[clap(long, short, default_value = DEFAULT_FUNDED_JSON_PATH)]
	output: PathBuf,

	/// Derivation blueprint to derive accounts with. An unique index will be appended.
	#[clap(long, short, default_value = DEFAULT_DERIVATION)]
	derivation: String,

	/// Number of threads to derive accounts with.
	#[clap(long, short, default_value = "4")]
	threads: usize,
}

#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
struct SendBalanceTransfersArgs {
	/// The node to connect to.
	#[clap(long, short)]
	node_url: String,

	/// Node index.
	#[clap(long, short)]
	node_index: usize,

	/// Total number of nodes
	#[clap(long, short)]
	total_nodes: usize,

	/// Chunk size for sending the extrinsics.
	#[clap(long, short, default_value_t = 50)]
	chunk_size: usize,

	/// Path to JSON file with the funded accounts.
	#[clap(long, short, default_value = DEFAULT_FUNDED_JSON_PATH)]
	funded_accounts: PathBuf,

	/// derivation blueprint to derive accounts with. An unique index will be appended.
	#[clap(long, short, default_value = DEFAULT_DERIVATION)]
	derivation: String,
}

#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
struct CheckPreConditionsArgs {
	/// The node to connect to.
	#[clap(long)]
	node_url: String,

	/// derivation blueprint to derive accounts with. An unique index will be appended.
	#[clap(long, short, default_value = DEFAULT_DERIVATION)]
	derivation: String,

	/// Path to JSON file with the funded accounts.
	#[clap(long, short, default_value = DEFAULT_FUNDED_JSON_PATH)]
	funded_accounts: PathBuf,
}

#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
struct CalculateTPSArgs {
	/// The node to connect to.
	#[clap(long)]
	node_url: String,

	/// Total number of nodes
	#[clap(long, short)]
	total_nodes: usize,

	/// Path to JSON file with the funded accounts.
	#[clap(long, short, default_value = DEFAULT_FUNDED_JSON_PATH)]
	funded_accounts: PathBuf,
}

#[tokio::main]
async fn main() -> Result<(), Error> {
	env_logger::init_from_env(
		env_logger::Env::default().filter_or(env_logger::DEFAULT_FILTER_ENV, "info"),
	);

	let cli = Cli::parse();
	match cli.command {
		Commands::FundAccountsJson(args) => {
			funder::funded_accounts_json(&args.derivation, args.n, &args.output, args.threads)
				.await?;
			info!("Wrote funded accounts to: {:?}", args.output);
		},
		Commands::SendBalanceTransfers(args) => {
			info!(
				"Node {}: Reading funded accounts from: {:?}",
				args.node_index, &args.funded_accounts
			);
			let n_accounts = funder::n_accounts(&args.funded_accounts);
			let n_transactions = n_accounts / args.total_nodes;

			// we need to truncate so that all nodes receive an equal amount of transactions
			let n_accounts_truncated = n_transactions * args.total_nodes;

			sender::send_funds(
				args.node_url,
				args.node_index,
				&args.derivation,
				args.chunk_size,
				n_transactions,
				n_accounts_truncated,
			)
			.await?;
		},
		Commands::CheckPreConditions(args) => {
			info!("Checking sTPS pre-conditions (account nonces and free balances).");
			let n = funder::n_accounts(&args.funded_accounts);
			pre::pre_conditions(&args.node_url, &args.derivation, n).await?;
		},
		Commands::CalculateTPS(args) => {
			info!("Calculating TPS on finalized blocks.");
			let n_accounts = funder::n_accounts(&args.funded_accounts);
			let n_transactions = n_accounts / args.total_nodes;

			// sender truncates, so we need to truncate here as well
			let n_accounts_truncated = n_transactions * args.total_nodes;

			tps::calc_tps(&args.node_url, n_accounts_truncated).await?;
		},
	}

	Ok(())
}
