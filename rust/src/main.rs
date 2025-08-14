use clap::{Parser, ValueEnum};

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

fn main() {
    let args: Args = Args::parse();

    let pattern: String = match utils::validate_hex_pattern(&args.pattern, 64) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("{}", e);
            std::process::exit(1);
        }
    };

    println!(
        "Pattern to match: {}\nHashing protocol: {}\nMax input length: {}",
        pattern, args.protocol, args.input_length
    );

    match miner::mine(&pattern, &args.protocol, args.input_length) {
        Ok(opt) => match opt {
            Some(m) => println!(
                "Matching Pattern Found\nInput: {}, Digest: {}",
                m.input(),
                m.digest()
            ),
            None => println!("No matching patterns found for pattern: {}", pattern),
        },
        Err(e) => {
            eprintln!("Error: {:?}", e);
        }
    }
}
