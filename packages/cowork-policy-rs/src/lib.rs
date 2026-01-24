use regex::RegexBuilder;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::env;
use std::path::{Component, Path, PathBuf};

const COWORK_POLICY_ACTIONS: [&str; 6] = [
    "file.read",
    "file.write",
    "file.*",
    "network.request",
    "connector.read",
    "connector.action",
];
const COWORK_POLICY_ACTION_COUNT: usize = COWORK_POLICY_ACTIONS.len();

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CoworkPolicyDecisionType {
    Allow,
    AllowWithConfirm,
    Deny,
}

impl CoworkPolicyDecisionType {
    pub fn as_str(&self) -> &'static str {
        match self {
            CoworkPolicyDecisionType::Allow => "allow",
            CoworkPolicyDecisionType::AllowWithConfirm => "allow_with_confirm",
            CoworkPolicyDecisionType::Deny => "deny",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CoworkRiskTag {
    Delete,
    Overwrite,
    Network,
    Connector,
    Batch,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CoworkPolicyConditions {
    pub path_within_grant: Option<bool>,
    pub path_within_output_root: Option<bool>,
    pub matches_pattern: Option<Vec<String>>,
    pub file_size_greater_than: Option<u64>,
    pub host_in_allowlist: Option<bool>,
    pub connector_scope_allowed: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CoworkPolicyRule {
    pub id: String,
    pub action: String,
    pub when: Option<CoworkPolicyConditions>,
    pub decision: CoworkPolicyDecisionType,
    pub risk_tags: Option<Vec<CoworkRiskTag>>,
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CoworkPolicyDefaults {
    pub fallback: CoworkPolicyDecisionType,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CoworkPolicyConfig {
    pub version: String,
    pub defaults: CoworkPolicyDefaults,
    pub rules: Vec<CoworkPolicyRule>,
}

impl CoworkPolicyConfig {
    pub fn validate(&self) -> Result<(), String> {
        if self.version != "1.0" {
            return Err("Unsupported policy version.".to_string());
        }
        for rule in &self.rules {
            if rule.id.trim().is_empty() {
                return Err("Policy rule id cannot be empty.".to_string());
            }
            if !is_valid_action(&rule.action) {
                return Err(format!("Invalid policy action: {}", rule.action));
            }
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoworkPolicyInput {
    pub action: String,
    pub path: Option<String>,
    #[serde(default)]
    pub grant_roots: Vec<String>,
    #[serde(default)]
    pub output_roots: Vec<String>,
    pub file_size_bytes: Option<u64>,
    pub host: Option<String>,
    #[serde(default)]
    pub host_allowlist: Vec<String>,
    pub connector_scope_allowed: Option<bool>,
    pub case_insensitive_paths: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CoworkPolicyDecision {
    pub decision: CoworkPolicyDecisionType,
    pub requires_confirmation: bool,
    pub reason: String,
    pub risk_tags: Vec<CoworkRiskTag>,
    pub rule_id: Option<String>,
}

pub struct CoworkPolicyEngine {
    config: CoworkPolicyConfig,
    action_rule_cache: [Vec<usize>; COWORK_POLICY_ACTION_COUNT],
}

impl CoworkPolicyEngine {
    pub fn new(config: CoworkPolicyConfig) -> Result<Self, String> {
        config.validate()?;
        let action_rule_cache = build_action_rule_cache(&config);
        Ok(Self {
            config,
            action_rule_cache,
        })
    }

    pub fn evaluate(&self, input: &CoworkPolicyInput) -> CoworkPolicyDecision {
        let case_insensitive = input.case_insensitive_paths.unwrap_or(false);
        let path_within_grant = input
            .path
            .as_deref()
            .map(|path| is_path_within_roots(path, &input.grant_roots, case_insensitive))
            .unwrap_or(false);
        let path_within_output_root = input
            .path
            .as_deref()
            .map(|path| is_path_within_roots(path, &input.output_roots, case_insensitive))
            .unwrap_or(false);
        let host_in_allowlist = input
            .host
            .as_ref()
            .map(|host| input.host_allowlist.contains(host))
            .unwrap_or(false);
        let connector_scope_allowed = input.connector_scope_allowed.unwrap_or(false);

        let context = CoworkPolicyContext {
            path_within_grant,
            path_within_output_root,
            host_in_allowlist,
            connector_scope_allowed,
            file_size_bytes: input.file_size_bytes,
            path: input.path.as_deref(),
            case_insensitive_paths: case_insensitive,
        };

        if let Some(rule_indices) = self.rule_indices_for_action(&input.action) {
            for rule_index in rule_indices {
                let rule = &self.config.rules[*rule_index];
                if !conditions_match(rule.when.as_ref(), &context) {
                    continue;
                }
                return build_decision(
                    rule.decision.clone(),
                    rule.reason.clone().unwrap_or_else(|| format!("rule:{}", rule.id)),
                    rule.risk_tags.clone().unwrap_or_default(),
                    Some(rule.id.clone()),
                );
            }
        } else {
            // Preserve legacy behavior for unknown actions by scanning rules.
            for rule in self.config.rules.iter().filter(|rule| rule.action == input.action) {
                if !conditions_match(rule.when.as_ref(), &context) {
                    continue;
                }
                return build_decision(
                    rule.decision.clone(),
                    rule.reason.clone().unwrap_or_else(|| format!("rule:{}", rule.id)),
                    rule.risk_tags.clone().unwrap_or_default(),
                    Some(rule.id.clone()),
                );
            }
            for rule in self
                .config
                .rules
                .iter()
                .filter(|rule| rule.action != input.action && action_matches(&rule.action, &input.action))
            {
                if !conditions_match(rule.when.as_ref(), &context) {
                    continue;
                }
                return build_decision(
                    rule.decision.clone(),
                    rule.reason.clone().unwrap_or_else(|| format!("rule:{}", rule.id)),
                    rule.risk_tags.clone().unwrap_or_default(),
                    Some(rule.id.clone()),
                );
            }
        }

        build_decision(
            self.config.defaults.fallback.clone(),
            "fallback".to_string(),
            Vec::new(),
            None,
        )
    }

    fn rule_indices_for_action(&self, action: &str) -> Option<&[usize]> {
        action_index(action)
            .map(|idx| self.action_rule_cache[idx].as_slice())
    }
}

fn action_index(action: &str) -> Option<usize> {
    COWORK_POLICY_ACTIONS
        .iter()
        .position(|candidate| *candidate == action)
}

fn build_action_rule_cache(config: &CoworkPolicyConfig) -> [Vec<usize>; COWORK_POLICY_ACTION_COUNT] {
    let mut exact: [Vec<usize>; COWORK_POLICY_ACTION_COUNT] = std::array::from_fn(|_| Vec::new());
    let mut wildcard: [Vec<usize>; COWORK_POLICY_ACTION_COUNT] =
        std::array::from_fn(|_| Vec::new());

    for (rule_index, rule) in config.rules.iter().enumerate() {
        for (action_index, action) in COWORK_POLICY_ACTIONS.iter().enumerate() {
            if !action_matches(&rule.action, action) {
                continue;
            }
            if rule.action == *action {
                exact[action_index].push(rule_index);
            } else {
                wildcard[action_index].push(rule_index);
            }
        }
    }

    let mut combined = exact;
    for index in 0..COWORK_POLICY_ACTION_COUNT {
        combined[index].extend(wildcard[index].drain(..));
    }

    combined
}

pub fn parse_cowork_policy_config(value: &Value) -> Result<CoworkPolicyConfig, String> {
    let config: CoworkPolicyConfig =
        serde_json::from_value(value.clone()).map_err(|err| err.to_string())?;
    config.validate()?;
    Ok(config)
}

pub fn compute_cowork_policy_hash(config: &CoworkPolicyConfig) -> String {
    let value = serde_json::to_value(config).unwrap_or(Value::Null);
    let serialized = stable_stringify(&value);
    sha256_hex(&serialized)
}

struct CoworkPolicyContext<'a> {
    path_within_grant: bool,
    path_within_output_root: bool,
    host_in_allowlist: bool,
    connector_scope_allowed: bool,
    file_size_bytes: Option<u64>,
    path: Option<&'a str>,
    case_insensitive_paths: bool,
}

fn build_decision(
    decision: CoworkPolicyDecisionType,
    reason: String,
    risk_tags: Vec<CoworkRiskTag>,
    rule_id: Option<String>,
) -> CoworkPolicyDecision {
    CoworkPolicyDecision {
        decision: decision.clone(),
        requires_confirmation: decision == CoworkPolicyDecisionType::AllowWithConfirm,
        reason,
        risk_tags,
        rule_id,
    }
}

fn conditions_match(conditions: Option<&CoworkPolicyConditions>, context: &CoworkPolicyContext) -> bool {
    let conditions = match conditions {
        Some(value) => value,
        None => return true,
    };

    match_bool(conditions.path_within_grant, context.path_within_grant)
        && match_bool(
            conditions.path_within_output_root,
            context.path_within_output_root,
        )
        && match_patterns(
            conditions.matches_pattern.as_ref(),
            context.path,
            context.case_insensitive_paths,
        )
        && match_size(conditions.file_size_greater_than, context.file_size_bytes)
        && match_bool(conditions.host_in_allowlist, context.host_in_allowlist)
        && match_bool(conditions.connector_scope_allowed, context.connector_scope_allowed)
}

fn match_bool(expected: Option<bool>, actual: bool) -> bool {
    match expected {
        Some(value) => value == actual,
        None => true,
    }
}

fn match_size(threshold: Option<u64>, size: Option<u64>) -> bool {
    match threshold {
        None => true,
        Some(limit) => size.map(|value| value > limit).unwrap_or(false),
    }
}

fn match_patterns(patterns: Option<&Vec<String>>, path: Option<&str>, case_insensitive: bool) -> bool {
    let patterns = match patterns {
        Some(value) => value,
        None => return true,
    };
    let path = match path {
        Some(value) => value,
        None => return false,
    };
    patterns
        .iter()
        .any(|pattern| match_glob(path, pattern, case_insensitive))
}

fn action_matches(rule_action: &str, input_action: &str) -> bool {
    if rule_action == input_action {
        return true;
    }
    if let Some(prefix) = rule_action.strip_suffix(".*") {
        return input_action.starts_with(&format!("{}.", prefix));
    }
    if rule_action.contains('*') {
        let escaped = regex::escape(rule_action).replace("\\*", ".*");
        let regex = RegexBuilder::new(&format!("^{}$", escaped))
            .case_insensitive(false)
            .build();
        if let Ok(regex) = regex {
            return regex.is_match(input_action);
        }
    }
    false
}

fn match_glob(target_path: &str, pattern: &str, case_insensitive: bool) -> bool {
    let normalized_target = match normalize_path_for_evaluation(target_path, case_insensitive) {
        Some(value) => value,
        None => return false,
    };
    let normalized_pattern = pattern.replace('\\', "/");
    let regex_body = regex::escape(&normalized_pattern)
        .replace("\\*\\*", ".*")
        .replace("\\*", "[^/]*");
    let regex = RegexBuilder::new(&format!("^{}$", regex_body))
        .case_insensitive(case_insensitive)
        .build();
    match regex {
        Ok(regex) => regex.is_match(&normalized_target),
        Err(_) => false,
    }
}

fn is_path_within_roots(target_path: &str, roots: &[String], case_insensitive: bool) -> bool {
    if roots.is_empty() {
        return false;
    }
    let normalized_target = match normalize_path_for_evaluation(target_path, case_insensitive) {
        Some(value) => value,
        None => return false,
    };
    for root in roots {
        let normalized_root = match normalize_path_for_evaluation(root, case_insensitive) {
            Some(value) => value,
            None => continue,
        };
        let root_with_slash = if normalized_root.ends_with('/') {
            normalized_root.clone()
        } else {
            format!("{}/", normalized_root)
        };
        if normalized_target == normalized_root || normalized_target.starts_with(&root_with_slash) {
            return true;
        }
    }
    false
}

fn normalize_path_for_evaluation(input: &str, case_insensitive: bool) -> Option<String> {
    let resolved = resolve_path(input)?;
    let mut normalized = resolved.to_string_lossy().replace('\\', "/");
    if case_insensitive {
        normalized = normalized.to_lowercase();
    }
    Some(normalized)
}

fn resolve_path(input: &str) -> Option<PathBuf> {
    let path = Path::new(input);
    let base = if path.is_absolute() {
        path.to_path_buf()
    } else {
        env::current_dir().ok()?.join(path)
    };
    Some(clean_path(base))
}

fn clean_path(path: PathBuf) -> PathBuf {
    let mut components = path.components();
    let mut output = PathBuf::new();
    let mut stack: Vec<PathBuf> = Vec::new();
    let mut prefix: Option<PathBuf> = None;
    let mut has_root = false;

    while let Some(component) = components.next() {
        match component {
            Component::Prefix(value) => {
                prefix = Some(PathBuf::from(value.as_os_str()));
            }
            Component::RootDir => {
                has_root = true;
            }
            Component::CurDir => {}
            Component::ParentDir => {
                stack.pop();
            }
            Component::Normal(value) => {
                stack.push(PathBuf::from(value));
            }
        }
    }

    if let Some(prefix_value) = prefix {
        output.push(prefix_value);
    }
    if has_root {
        output.push(Path::new("/"));
    }
    for part in stack {
        output.push(part);
    }
    output
}

fn stable_stringify(value: &Value) -> String {
    match value {
        Value::Array(items) => {
            let inner = items
                .iter()
                .map(stable_stringify)
                .collect::<Vec<String>>()
                .join(",");
            format!("[{}]", inner)
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let inner = keys
                .into_iter()
                .map(|key| format!("{}:{}", key, stable_stringify(&map[key])))
                .collect::<Vec<String>>()
                .join(",");
            format!("{{{}}}", inner)
        }
        _ => value.to_string(),
    }
}

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let digest = hasher.finalize();
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

fn is_valid_action(action: &str) -> bool {
    COWORK_POLICY_ACTIONS.contains(&action)
}
