use url::Url;

use crate::policy::NetworkPolicy;
use super::filesystem::ViolationResult;

pub struct NetworkGuard {
    policy: NetworkPolicy,
}

impl NetworkGuard {
    pub fn new(policy: NetworkPolicy) -> Self {
        Self { policy }
    }

    pub fn check_request(&self, url: &str, _method: &str) -> ViolationResult {
        if !self.policy.enabled {
            return ViolationResult {
                allowed: false,
                reason: Some("Network access disabled by policy".to_string()),
            };
        }

        let parsed = match Url::parse(url) {
            Ok(value) => value,
            Err(_) => {
                return ViolationResult {
                    allowed: false,
                    reason: Some("Invalid URL".to_string()),
                };
            }
        };

        if parsed.scheme() == "https" && !self.policy.allow_https {
            return ViolationResult {
                allowed: false,
                reason: Some("HTTPS not allowed".to_string()),
            };
        }

        if parsed.scheme() == "http" && !self.policy.allow_http {
            return ViolationResult {
                allowed: false,
                reason: Some("HTTP not allowed".to_string()),
            };
        }

        if let Some(host) = parsed.host_str() {
            if self.is_localhost(host) && !self.policy.allow_localhost {
                return ViolationResult {
                    allowed: false,
                    reason: Some("Localhost access not allowed".to_string()),
                };
            }

            if let Some(ref allowed) = self.policy.allowed_domains {
                if !self.is_allowed_domain(host, allowed) {
                    return ViolationResult {
                        allowed: false,
                        reason: Some(format!("Domain {host} not in whitelist")),
                    };
                }
            }

            if let Some(ref blocked) = self.policy.blocked_domains {
                if self.is_blocked_domain(host, blocked) {
                    return ViolationResult {
                        allowed: false,
                        reason: Some(format!("Domain {host} in blacklist")),
                    };
                }
            }
        }

        ViolationResult {
            allowed: true,
            reason: None,
        }
    }

    fn is_localhost(&self, host: &str) -> bool {
        host == "localhost" || host == "127.0.0.1" || host == "::1"
    }

    fn is_allowed_domain(&self, host: &str, allowed: &[String]) -> bool {
        allowed.iter().any(|domain| host == domain || host.ends_with(&format!(".{domain}")))
    }

    fn is_blocked_domain(&self, host: &str, blocked: &[String]) -> bool {
        blocked.iter().any(|domain| host == domain || host.ends_with(&format!(".{domain}")))
    }
}
