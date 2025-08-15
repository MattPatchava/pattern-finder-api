use anyhow::Result;
use clap::{Parser, ValueEnum};
use serde::Serialize;

mod miner;
mod utils;

#[derive(Parser)]
#[command(
    about = "A parallelised brute force miner for finding inputs that hash to a user-specified digest pattern.",
    version
)]
struct Args {
    #[arg(long)]
    pattern: String,

    #[arg(long, default_value_t = HashingProtocol::Sha256)]
    protocol: HashingProtocol,

    #[arg(long, default_value_t = 6)]
    input_length: usize,

    #[arg(long, default_value_t = OutputFormat::Text)]
    format: OutputFormat,
}

#[derive(ValueEnum, Clone)]
enum OutputFormat {
    Text,
    Json,
}

impl std::fmt::Display for OutputFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> Result<(), std::fmt::Error> {
        write!(
            f,
            "{}",
            match self {
                OutputFormat::Text => "text",
                OutputFormat::Json => "json",
            }
        )
    }
}

#[derive(ValueEnum, Clone)]
enum HashingProtocol {
    Sha256,
    // Md5,
}

impl std::fmt::Display for HashingProtocol {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> Result<(), std::fmt::Error> {
        write!(
            f,
            "{}",
            match self {
                HashingProtocol::Sha256 => "sha256",
                // HashingProtocol::Md5 => "md5",
            }
        )
    }
}

#[derive(Serialize)]
struct MiningResult {
    success: bool,
    match_data: Option<miner::MinedMatch>,
    message: Option<String>,
}

fn main() -> Result<()> {
    let args: Args = Args::parse();

    let pattern: String = match utils::validate_hex_pattern(&args.pattern, 64) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("{}", e);
            std::process::exit(1);
        }
    };

    if let OutputFormat::Text = args.format {
        println!(
            r"
pattern-finder
==============

Pattern: {}
Protocol: {}
Max Input Length: {}

Mining...
",
            pattern, args.protocol, args.input_length
        );
    }

    if let Some(m) = miner::mine(&pattern, &args.protocol, args.input_length)? {
        match args.format {
            OutputFormat::Json => {
                let mining_result: MiningResult = MiningResult {
                    success: true,
                    match_data: Some(m),
                    message: None,
                };
                serde_json::to_writer(std::io::stdout(), &mining_result)?
            }
            OutputFormat::Text => {
                println!("Match Found\nInput: {},\nDigest: {}", m.input(), m.digest())
            }
        }
    } else {
        match args.format {
            OutputFormat::Json => {
                let mining_result: MiningResult = MiningResult {
                    success: false,
                    match_data: None,
                    message: None,
                };
                serde_json::to_writer(std::io::stdout(), &mining_result)?
            }
            OutputFormat::Text => {
                println!(
                    "No pattern found with the specified prefix. Try increasing the input length."
                );
            }
        }
    }

    Ok(())
}
