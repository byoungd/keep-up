use simsimd::SpatialSimilarity;
use thiserror::Error;

#[derive(Debug, Error, PartialEq)]
pub enum VectorSimilarityError {
    #[error("Vectors must have same dimension")]
    DimensionMismatch,
}

fn dot(a: &[f32], b: &[f32]) -> Result<f64, VectorSimilarityError> {
    f32::dot(a, b).ok_or(VectorSimilarityError::DimensionMismatch)
}

/// Compute cosine similarity between two vectors.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> Result<f64, VectorSimilarityError> {
    if a.len() != b.len() {
        return Err(VectorSimilarityError::DimensionMismatch);
    }

    let dot_ab = dot(a, b)?;
    let norm_a = dot(a, a)?;
    let norm_b = dot(b, b)?;
    let magnitude = (norm_a * norm_b).sqrt();

    if magnitude == 0.0 {
        return Ok(0.0);
    }

    Ok(dot_ab / magnitude)
}

/// Compute cosine similarity for a query against multiple targets.
pub fn cosine_similarity_batch(
    query: &[f32],
    targets: &[&[f32]],
) -> Result<Vec<f64>, VectorSimilarityError> {
    let query_norm = dot(query, query)?;
    let mut results = Vec::with_capacity(targets.len());

    for target in targets {
        if target.len() != query.len() {
            return Err(VectorSimilarityError::DimensionMismatch);
        }

        let dot_ab = dot(query, target)?;
        let norm_b = dot(target, target)?;
        let magnitude = (query_norm * norm_b).sqrt();

        if magnitude == 0.0 {
            results.push(0.0);
            continue;
        }

        results.push(dot_ab / magnitude);
    }

    Ok(results)
}

/// Compute Euclidean distance between two vectors.
pub fn euclidean_distance(a: &[f32], b: &[f32]) -> Result<f64, VectorSimilarityError> {
    f32::l2(a, b).ok_or(VectorSimilarityError::DimensionMismatch)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_close(value: f64, expected: f64) {
        let delta = (value - expected).abs();
        assert!(delta < 1e-6, "Expected {expected}, got {value}");
    }

    #[test]
    fn cosine_similarity_identical() {
        let vector = [1.0_f32, 2.0, 3.0];
        let similarity = cosine_similarity(&vector, &vector).expect("match dimensions");
        assert_close(similarity, 1.0);
    }

    #[test]
    fn cosine_similarity_orthogonal() {
        let a = [1.0_f32, 0.0, 0.0];
        let b = [0.0_f32, 1.0, 0.0];
        let similarity = cosine_similarity(&a, &b).expect("match dimensions");
        assert_close(similarity, 0.0);
    }

    #[test]
    fn cosine_similarity_opposite() {
        let a = [1.0_f32, 0.0, 0.0];
        let b = [-1.0_f32, 0.0, 0.0];
        let similarity = cosine_similarity(&a, &b).expect("match dimensions");
        assert_close(similarity, -1.0);
    }

    #[test]
    fn cosine_similarity_zero_vector() {
        let a = [0.0_f32, 0.0, 0.0];
        let b = [1.0_f32, 2.0, 3.0];
        let similarity = cosine_similarity(&a, &b).expect("match dimensions");
        assert_close(similarity, 0.0);
    }

    #[test]
    fn cosine_similarity_dimension_mismatch() {
        let a = [1.0_f32, 2.0];
        let b = [1.0_f32, 2.0, 3.0];
        let error = cosine_similarity(&a, &b).expect_err("should error");
        assert_eq!(error, VectorSimilarityError::DimensionMismatch);
    }

    #[test]
    fn cosine_similarity_batch_matches_single() {
        let query = [1.0_f32, 2.0, 3.0];
        let target_a = [1.0_f32, 2.0, 3.0];
        let target_b = [3.0_f32, 2.0, 1.0];
        let target_c = [0.0_f32, 0.0, 0.0];
        let targets = [&target_a[..], &target_b[..], &target_c[..]];

        let batch = cosine_similarity_batch(&query, &targets).expect("batch ok");
        let single_a = cosine_similarity(&query, &target_a).expect("single a");
        let single_b = cosine_similarity(&query, &target_b).expect("single b");
        let single_c = cosine_similarity(&query, &target_c).expect("single c");

        assert_eq!(batch.len(), 3);
        assert_close(batch[0], single_a);
        assert_close(batch[1], single_b);
        assert_close(batch[2], single_c);
    }

    #[test]
    fn euclidean_distance_matches_expected() {
        let a = [0.0_f32, 0.0, 0.0];
        let b = [3.0_f32, 4.0, 0.0];
        let distance = euclidean_distance(&a, &b).expect("match dimensions");
        assert_close(distance, 5.0);
    }
}
