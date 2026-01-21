mod core;

use napi::bindgen_prelude::Float32Array;
use napi_derive::napi;

fn to_napi_error(error: core::VectorSimilarityError) -> napi::Error {
    napi::Error::from_reason(error.to_string())
}

/// Compute cosine similarity between two Float32 arrays.
#[napi(js_name = "cosineSimilarity")]
pub fn cosine_similarity(a: Float32Array, b: Float32Array) -> napi::Result<f64> {
    core::cosine_similarity(a.as_ref(), b.as_ref()).map_err(to_napi_error)
}

/// Compute cosine similarity between a query vector and a list of target vectors.
#[napi(js_name = "cosineSimilarityBatch")]
pub fn cosine_similarity_batch(
    query: Float32Array,
    targets: Vec<Float32Array>,
) -> napi::Result<Vec<f64>> {
    if targets.is_empty() {
        return Ok(Vec::new());
    }

    let target_refs: Vec<&[f32]> = targets.iter().map(|target| target.as_ref()).collect();
    core::cosine_similarity_batch(query.as_ref(), &target_refs).map_err(to_napi_error)
}

/// Compute Euclidean distance between two Float32 arrays.
#[napi(js_name = "euclideanDistance")]
pub fn euclidean_distance(a: Float32Array, b: Float32Array) -> napi::Result<f64> {
    core::euclidean_distance(a.as_ref(), b.as_ref()).map_err(to_napi_error)
}
