pub fn validate_hex_pattern(s: &str, max_length: usize) -> Result<String, String> {
    if s.is_empty() {
        return Err(String::from("Pattern cannot be empty."));
    }

    if s.len() > max_length {
        return Err("Pattern cannot exceed the length of the hash digest.".to_string());
    }

    if !s.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Pattern must only contain hexadecimal digits.".into());
    }

    Ok(s.to_lowercase())
}
