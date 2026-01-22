use hmac::{Hmac, Mac};
use napi::bindgen_prelude::{Buffer, Result as NapiResult};
use napi_derive::napi;
use sha2::Sha256;
use std::fmt;

type HmacSha256 = Hmac<Sha256>;

const CRC32_POLY: u32 = 0xedb88320;
const CRC32_LEN: usize = 4;
const ADLER_MOD: u32 = 65521;

#[napi(js_name = "hmacSha256")]
pub fn hmac_sha256(key: Buffer, message: Buffer) -> NapiResult<Buffer> {
    let mut mac = HmacSha256::new_from_slice(&key).map_err(to_napi_error)?;
    mac.update(&message);
    let result = mac.finalize().into_bytes();
    Ok(Buffer::from(result.to_vec()))
}

#[napi(js_name = "crc32")]
pub fn crc32(data: Buffer) -> Buffer {
    Buffer::from(compute_crc32_bytes(&data).to_vec())
}

#[napi(js_name = "verifyCrc32")]
pub fn verify_crc32(data: Buffer, expected: Buffer) -> bool {
    if expected.len() != CRC32_LEN {
        return false;
    }
    let computed = compute_crc32_bytes(&data);
    expected.as_ref() == computed.as_slice()
}

#[napi(js_name = "adler32")]
pub fn adler32(input: String) -> String {
    let mut a: u32 = 1;
    let mut b: u32 = 0;
    for code_unit in input.encode_utf16() {
        a = (a + u32::from(code_unit)) % ADLER_MOD;
        b = (b + a) % ADLER_MOD;
    }
    let checksum = (b << 16) | a;
    format!("{checksum:x}")
}

fn compute_crc32_bytes(data: &[u8]) -> [u8; CRC32_LEN] {
    let mut crc: u32 = 0xffffffff;
    for byte in data {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            if crc & 1 == 1 {
                crc = (crc >> 1) ^ CRC32_POLY;
            } else {
                crc >>= 1;
            }
        }
    }
    crc = (crc ^ 0xffffffff) & 0xffffffff;

    [
        ((crc >> 24) & 0xff) as u8,
        ((crc >> 16) & 0xff) as u8,
        ((crc >> 8) & 0xff) as u8,
        (crc & 0xff) as u8,
    ]
}

fn to_napi_error(error: impl fmt::Display) -> napi::Error {
    napi::Error::from_reason(error.to_string())
}
