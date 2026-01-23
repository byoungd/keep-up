use regex::Regex;

use crate::policy::CommandPolicy;
use super::filesystem::ViolationResult;

pub struct CommandValidator {
    policy: CommandPolicy,
    dangerous_patterns: Vec<Regex>,
}

impl CommandValidator {
    pub fn new(policy: CommandPolicy) -> Self {
        let dangerous_patterns = vec![
            Regex::new(r"rm\s+-rf\s+/").unwrap(),
            Regex::new(r"dd\s+if=").unwrap(),
            Regex::new(r"mkfs").unwrap(),
            Regex::new(r":\(\)\{.*:\|:&\};:").unwrap(),
            Regex::new(r"chmod\s+777").unwrap(),
        ];

        Self {
            policy,
            dangerous_patterns,
        }
    }

    pub fn validate_command(&self, command: &str) -> ViolationResult {
        let normalized = command.trim().to_lowercase();

        if normalized.contains("sudo") && !self.policy.allow_sudo {
            return ViolationResult {
                allowed: false,
                reason: Some("sudo not allowed".to_string()),
            };
        }

        if self.policy.mode == "whitelist" {
            if let Some(ref allowed) = self.policy.allowed_commands {
                if !self.is_whitelisted(&normalized, allowed) {
                    return ViolationResult {
                        allowed: false,
                        reason: Some("Command not in whitelist".to_string()),
                    };
                }
            }
        }

        if self.policy.mode == "blacklist" {
            if let Some(ref blocked) = self.policy.blocked_commands {
                if self.is_blacklisted(&normalized, blocked) {
                    return ViolationResult {
                        allowed: false,
                        reason: Some("Command in blacklist".to_string()),
                    };
                }
            }
        }

        if self.is_dangerous(&normalized) {
            return ViolationResult {
                allowed: false,
                reason: Some("Command matches dangerous pattern".to_string()),
            };
        }

        ViolationResult {
            allowed: true,
            reason: None,
        }
    }

    fn is_whitelisted(&self, command: &str, allowed: &[String]) -> bool {
        allowed
            .iter()
            .any(|allowed_command| command.starts_with(&allowed_command.to_lowercase()))
    }

    fn is_blacklisted(&self, command: &str, blocked: &[String]) -> bool {
        blocked
            .iter()
            .any(|blocked_command| command.contains(&blocked_command.to_lowercase()))
    }

    fn is_dangerous(&self, command: &str) -> bool {
        self.dangerous_patterns
            .iter()
            .any(|pattern| pattern.is_match(command))
    }
}
