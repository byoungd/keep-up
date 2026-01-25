use cowork_policy_rs::{
    parse_cowork_policy_config, CoworkPolicyDecisionType, CoworkPolicyEngine, CoworkPolicyInput,
    CoworkRiskTag,
};
use serde::Deserialize;
use serde_json::Value;

const VECTOR_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../agent-runtime-core/src/policy/cowork-policy-parity.json"
));

#[derive(Deserialize)]
struct PolicyVectorFile {
    version: String,
    policies: Vec<PolicyVector>,
}

#[derive(Deserialize)]
struct PolicyVector {
    id: String,
    config: Value,
    cases: Vec<PolicyCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PolicyCase {
    name: String,
    input: CoworkPolicyInput,
    expected: PolicyExpected,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PolicyExpected {
    decision: CoworkPolicyDecisionType,
    requires_confirmation: Option<bool>,
    rule_id: Option<String>,
    reason: Option<String>,
    risk_tags: Option<Vec<CoworkRiskTag>>,
}

#[test]
fn policy_parity_vectors_match() {
    let vectors: PolicyVectorFile = serde_json::from_str(VECTOR_JSON).expect("parse vectors");
    assert_eq!(vectors.version, "1");

    for policy in vectors.policies {
        let config = parse_cowork_policy_config(&policy.config)
            .unwrap_or_else(|err| panic!("invalid policy config {}: {}", policy.id, err));
        let engine = CoworkPolicyEngine::new(config)
            .unwrap_or_else(|err| panic!("failed to build engine {}: {}", policy.id, err));

        for case in policy.cases {
            let decision = engine.evaluate(&case.input);

            assert_eq!(
                decision.decision, case.expected.decision,
                "policy {} case {}",
                policy.id, case.name
            );

            if let Some(expected_confirmation) = case.expected.requires_confirmation {
                assert_eq!(
                    decision.requires_confirmation, expected_confirmation,
                    "policy {} case {}",
                    policy.id, case.name
                );
            }

            if let Some(expected_rule_id) = case.expected.rule_id {
                assert_eq!(
                    decision.rule_id.as_deref(),
                    Some(expected_rule_id.as_str()),
                    "policy {} case {}",
                    policy.id, case.name
                );
            }

            if let Some(expected_reason) = case.expected.reason {
                assert_eq!(
                    decision.reason, expected_reason,
                    "policy {} case {}",
                    policy.id, case.name
                );
            }

            if let Some(expected_tags) = case.expected.risk_tags {
                for tag in expected_tags {
                    assert!(
                        decision.risk_tags.contains(&tag),
                        "policy {} case {} missing tag {:?}",
                        policy.id,
                        case.name,
                        tag
                    );
                }
            }
        }
    }
}
