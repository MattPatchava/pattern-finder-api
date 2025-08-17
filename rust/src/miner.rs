use anyhow::{Context, Result};
use rayon::prelude::*;
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::HashingProtocol;

#[derive(Serialize)]
pub struct MinedMatch {
    input: String,
    digest: String,
}

impl MinedMatch {
    pub fn input(&self) -> &str {
        &self.input
    }

    pub fn digest(&self) -> &str {
        &self.digest
    }
}

pub fn mine(
    pattern: &str,
    _protocol: &HashingProtocol,
    max_input_length: usize,
) -> Result<Option<MinedMatch>> {
    let max_input_number: usize;

    if max_input_length < 20 {
        max_input_number = 10_u64.pow(max_input_length as u32) as usize;
    } else {
        eprintln!("Input lengths greater than 19 are not supported in this version. Check newer releases for this functionality.");
        return Ok(None);
    }

    let pattern_bytes: Vec<u8> =
        hex::decode(pattern).context("Decoding hex-encoded string to Vec<u8>")?;

    let result = (0..=max_input_number).into_par_iter().find_map_any(|i| {
        let s = i.to_string();
        match compare_patterns(&s, &pattern_bytes) {
            Some(digest) => Some(MinedMatch { input: s, digest }),
            None => None,
        }
    });

    Ok(result)
}

fn compare_patterns(input: &str, pattern: &[u8]) -> Option<String> {
    let digest: [u8; 32] = Sha256::digest(input.as_bytes()).into();

    if &digest[..pattern.len()] == pattern {
        Some(hex::encode(digest))
    } else {
        None
    }
}
