use fs_err as fs;

use clap::Parser;
use std::path::PathBuf;

#[derive(Parser)]
#[clap(author, version, about, long_about = None)]
struct Cli {
    /// Optional name to operate on
    #[clap(value_parser)]
    file_path: PathBuf,
}

pub fn main() {
    let cli = Cli::parse();
    let unparsed_file = fs::read_to_string(&cli.file_path).expect(&format!(
        "cannot read file {}",
        cli.file_path.to_string_lossy()
    ));
    let a = parser::parse(&unparsed_file);
    match a {
        Ok(test_def) => {
            println!("{}", serde_json::to_string_pretty(&test_def).unwrap());
        }
        Err(e) => {
            println!("{}", e);
        }
    }
}
