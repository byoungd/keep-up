"use client";

import { DebugSection } from "../DebugSection";

interface PolicySectionProps {
  policyManifest: {
    spec_version: string;
    protocol_version: string;
    extensions?: Record<string, unknown>;
    chain_policy?: {
      kind: string;
      maxInterveningBlocks?: number;
    };
    relocation_policy?: {
      level1?: Record<string, unknown>;
      level2?: Record<string, unknown>;
      level3?: Record<string, unknown>;
    };
    ai_sanitization_policy?: {
      mode: string;
      limits?: {
        max_tokens?: number;
        max_blocks_per_op?: number;
      };
    };
  } | null;
}

export function PolicySection({ policyManifest }: PolicySectionProps) {
  if (!policyManifest) {
    return (
      <DebugSection title="Policy" defaultOpen={false}>
        <div className="lfcc-debug-row">
          <span className="lfcc-debug-label">Status:</span>
          <span className="lfcc-debug-value lfcc-debug-value--muted">Not initialized</span>
        </div>
      </DebugSection>
    );
  }

  return (
    <DebugSection title="Policy" defaultOpen={false}>
      <div className="lfcc-debug-policy">
        {/* Version Info */}
        <div className="lfcc-debug-row">
          <span className="lfcc-debug-label">Spec:</span>
          <span className="lfcc-debug-value">{policyManifest.spec_version}</span>
        </div>
        <div className="lfcc-debug-row">
          <span className="lfcc-debug-label">Protocol:</span>
          <span className="lfcc-debug-value">{policyManifest.protocol_version}</span>
        </div>

        {/* Extensions */}
        {policyManifest.extensions && Object.keys(policyManifest.extensions).length > 0 && (
          <div className="lfcc-debug-row">
            <span className="lfcc-debug-label">Extensions:</span>
            <span className="lfcc-debug-value">
              {Object.keys(policyManifest.extensions).join(", ")}
            </span>
          </div>
        )}

        {/* Chain Policy */}
        {policyManifest.chain_policy && (
          <div className="lfcc-debug-row">
            <span className="lfcc-debug-label">Chain:</span>
            <span className="lfcc-debug-value">
              {policyManifest.chain_policy.kind}
              {policyManifest.chain_policy.maxInterveningBlocks !== undefined && (
                <span className="lfcc-debug-badge">
                  max {policyManifest.chain_policy.maxInterveningBlocks}
                </span>
              )}
            </span>
          </div>
        )}

        {/* AI Sanitization */}
        {policyManifest.ai_sanitization_policy && (
          <>
            <div className="lfcc-debug-row">
              <span className="lfcc-debug-label">AI Mode:</span>
              <span className="lfcc-debug-value">{policyManifest.ai_sanitization_policy.mode}</span>
            </div>
            {policyManifest.ai_sanitization_policy.limits && (
              <div className="lfcc-debug-row">
                <span className="lfcc-debug-label">AI Limits:</span>
                <span className="lfcc-debug-value lfcc-debug-value--code">
                  {JSON.stringify(policyManifest.ai_sanitization_policy.limits)}
                </span>
              </div>
            )}
          </>
        )}

        {/* Relocation Policy Summary */}
        {policyManifest.relocation_policy && (
          <div className="lfcc-debug-row">
            <span className="lfcc-debug-label">Relocation:</span>
            <span className="lfcc-debug-value lfcc-debug-value--code">
              L1:{policyManifest.relocation_policy.level1 ? "✓" : "—"} L2:
              {policyManifest.relocation_policy.level2 ? "✓" : "—"} L3:
              {policyManifest.relocation_policy.level3 ? "✓" : "—"}
            </span>
          </div>
        )}
      </div>
    </DebugSection>
  );
}
