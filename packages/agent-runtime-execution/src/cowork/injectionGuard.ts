/**
 * Cowork Prompt Injection Guard (Heuristic)
 *
 * Lightweight signal detection for untrusted content sources.
 */

export type CoworkContentSourceType = "web" | "connector" | "local";

export interface CoworkContentSource {
  type: CoworkContentSourceType;
  trusted: boolean;
}

export interface CoworkPromptInjectionAssessment {
  risk: "low" | "medium" | "high";
  signals: string[];
}

const INJECTION_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "override_instructions", pattern: /ignore (all|previous) instructions/i },
  { label: "system_prompt", pattern: /system prompt/i },
  { label: "exfiltration", pattern: /exfiltrate|steal|send.*secret/i },
  { label: "credentials", pattern: /password|api key|token|secret/i },
  { label: "destructive", pattern: /rm -rf|format disk|delete everything/i },
];

export function assessPromptInjection(
  content: string,
  source: CoworkContentSource
): CoworkPromptInjectionAssessment {
  const signals = detectSignals(content);

  if (source.trusted) {
    return { risk: signals.length > 0 ? "medium" : "low", signals };
  }

  return { risk: signals.length > 0 ? "high" : "medium", signals };
}

export function detectSignals(content: string): string[] {
  const matches: string[] = [];

  for (const entry of INJECTION_PATTERNS) {
    if (entry.pattern.test(content)) {
      matches.push(entry.label);
    }
  }

  return matches;
}
