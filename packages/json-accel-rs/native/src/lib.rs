use napi::bindgen_prelude::Result as NapiResult;
use napi_derive::napi;
use serde_json::Value;

const MAX_JSON_DEPTH: usize = 128;

#[napi]
pub fn stringify(value: Value) -> NapiResult<String> {
  ensure_depth(&value).map_err(to_napi_error)?;
  simd_json::to_string(&value).map_err(to_napi_error)
}

#[napi]
pub fn parse(text: String) -> NapiResult<Value> {
  let value = parse_json(&text).map_err(to_napi_error)?;
  ensure_depth(&value).map_err(to_napi_error)?;
  Ok(value)
}

#[napi(js_name = "stableStringify")]
pub fn stable_stringify(value: Value) -> NapiResult<String> {
  ensure_depth(&value).map_err(to_napi_error)?;
  let sorted = sort_json_value(value);
  simd_json::to_string(&sorted).map_err(to_napi_error)
}

fn parse_json(text: &str) -> Result<Value, String> {
  let mut bytes = text.as_bytes().to_vec();
  match simd_json::from_slice::<Value>(&mut bytes) {
    Ok(value) => Ok(value),
    Err(simd_error) => serde_json::from_str(text).map_err(|serde_error| {
      format!(
        "simd-json parse failed: {simd_error}; serde-json parse failed: {serde_error}"
      )
    }),
  }
}

fn ensure_depth(value: &Value) -> Result<(), String> {
  let mut stack: Vec<(&Value, usize)> = vec![(value, 1)];
  while let Some((current, depth)) = stack.pop() {
    if depth > MAX_JSON_DEPTH {
      return Err(format!("JSON exceeded max depth of {MAX_JSON_DEPTH}"));
    }
    match current {
      Value::Array(values) => {
        for entry in values {
          stack.push((entry, depth + 1));
        }
      }
      Value::Object(map) => {
        for entry in map.values() {
          stack.push((entry, depth + 1));
        }
      }
      _ => {}
    }
  }
  Ok(())
}

fn sort_json_value(value: Value) -> Value {
  match value {
    Value::Array(values) => {
      Value::Array(values.into_iter().map(sort_json_value).collect())
    }
    Value::Object(map) => {
      let mut entries: Vec<(String, Value)> = map.into_iter().collect();
      entries.sort_by(|(a, _), (b, _)| a.cmp(b));
      let mut sorted = serde_json::Map::with_capacity(entries.len());
      for (key, entry_value) in entries {
        sorted.insert(key, sort_json_value(entry_value));
      }
      Value::Object(sorted)
    }
    _ => value,
  }
}

fn to_napi_error(error: impl std::fmt::Display) -> napi::Error {
  napi::Error::from_reason(error.to_string())
}
