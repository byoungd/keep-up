import type { ContentChunk, DataAccessPolicy } from "@keepup/core";
import { applyDataAccessPolicyToChunks } from "@keepup/core";

export type ConsentOverride = "allow" | "deny";

export type ConsentDecision = {
  baseAllow: boolean;
  allowContext: boolean;
  needsDisclosure: boolean;
};

export type ConsentDecisionInput = {
  globalAllow: boolean;
  docOverride?: ConsentOverride;
  disclosureAccepted: boolean;
};

export type ContextSection = {
  label: "Selected Text" | "Visible Content";
  text: string;
  originalLength: number;
  truncated: boolean;
};

export type RedactionSummary = {
  total: number;
  byLabel: Record<string, number>;
};

export type ContextPayload = {
  sections: ContextSection[];
  text: string;
  redactions: RedactionSummary;
};

const DEFAULT_MAX_SELECTED_CHARS = 2000;
const DEFAULT_MAX_PAGE_CHARS = 6000;

const DEFAULT_DATA_ACCESS_POLICY: DataAccessPolicy = {
  max_context_chars: 8000,
  redaction_strategy: "mask",
  pii_handling: "mask",
};

const REDACTION_RULES: Array<{ label: string; pattern: RegExp }> = [
  { label: "api_key", pattern: /\bsk-[A-Za-z0-9]{16,}\b/g },
  { label: "google_api_key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { label: "aws_access_key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36}\b/g },
  { label: "slack_token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { label: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/g },
  { label: "email", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { label: "phone", pattern: /\b\+?[0-9]{1,3}[-. (]*[0-9]{2,4}[-. )]*[0-9]{3,4}[-. ]*[0-9]{4}\b/g },
];

function clampText(text: string, maxChars: number) {
  if (maxChars <= 0) {
    return { text: "", truncated: text.length > 0, originalLength: text.length };
  }
  if (text.length <= maxChars) {
    return { text, truncated: false, originalLength: text.length };
  }
  return { text: text.slice(0, maxChars), truncated: true, originalLength: text.length };
}

export function evaluateConsent(input: ConsentDecisionInput): ConsentDecision {
  const baseAllow = input.docOverride ? input.docOverride === "allow" : input.globalAllow;
  const allowContext = baseAllow && input.disclosureAccepted;
  return {
    baseAllow,
    allowContext,
    needsDisclosure: baseAllow && !input.disclosureAccepted,
  };
}

export function buildContextSections(options: {
  selectedText?: string;
  pageContext?: string;
  maxSelectedChars?: number;
  maxPageChars?: number;
  includePageContextWithSelection?: boolean;
}): ContextSection[] {
  const sections: ContextSection[] = [];
  const selectedRaw = options.selectedText?.trim();
  const pageRaw = options.pageContext?.trim();
  const maxSelectedChars = options.maxSelectedChars ?? DEFAULT_MAX_SELECTED_CHARS;
  const maxPageChars = options.maxPageChars ?? DEFAULT_MAX_PAGE_CHARS;
  const includePageContextWithSelection = options.includePageContextWithSelection ?? false;

  if (selectedRaw) {
    const clamped = clampText(selectedRaw, maxSelectedChars);
    sections.push({
      label: "Selected Text",
      text: clamped.text,
      originalLength: clamped.originalLength,
      truncated: clamped.truncated,
    });
  }

  if (pageRaw && (includePageContextWithSelection || !selectedRaw)) {
    const clamped = clampText(pageRaw, maxPageChars);
    sections.push({
      label: "Visible Content",
      text: clamped.text,
      originalLength: clamped.originalLength,
      truncated: clamped.truncated,
    });
  }

  return sections;
}

export function redactSensitiveText(text: string): { text: string; summary: RedactionSummary } {
  let redacted = text;
  const summary: RedactionSummary = { total: 0, byLabel: {} };

  for (const rule of REDACTION_RULES) {
    let count = 0;
    redacted = redacted.replace(rule.pattern, () => {
      count += 1;
      return "[REDACTED]";
    });
    if (count > 0) {
      summary.byLabel[rule.label] = count;
      summary.total += count;
    }
  }

  return { text: redacted, summary };
}

export function formatContextBlock(sections: ContextSection[]): string {
  if (sections.length === 0) {
    return "";
  }
  const lines: string[] = ["--- Context ---"];
  for (const section of sections) {
    lines.push(`[${section.label}]:`);
    lines.push(section.text);
  }
  return lines.join("\n");
}

export function createContextPayload(options: {
  selectedText?: string;
  pageContext?: string;
  maxSelectedChars?: number;
  maxPageChars?: number;
  includePageContextWithSelection?: boolean;
  policy?: DataAccessPolicy;
}): ContextPayload | null {
  const sections = buildContextSections(options);
  if (sections.length === 0) {
    return null;
  }
  const policy = options.policy ?? DEFAULT_DATA_ACCESS_POLICY;
  const filteredSections = applyPolicyToSections(sections, policy);
  if (filteredSections.length === 0) {
    return null;
  }
  const block = formatContextBlock(filteredSections);
  const redacted = redactSensitiveText(block);
  return {
    sections: filteredSections,
    text: redacted.text,
    redactions: redacted.summary,
  };
}

export function composePromptWithContext(prompt: string, contextBlock: string | null): string {
  if (!contextBlock) {
    return prompt;
  }
  return `${prompt}\n\n${contextBlock}`;
}

function buildPolicyChunks(sections: ContextSection[]): {
  chunks: ContentChunk[];
  lookup: Map<string, ContextSection>;
} {
  const lookup = new Map<string, ContextSection>();
  const chunks: ContentChunk[] = sections.map((section, idx) => {
    const blockId = section.label === "Selected Text" ? "selected" : `visible_${idx}`;
    lookup.set(blockId, section);
    return {
      block_id: blockId,
      content: section.text,
      relevance: 1,
    };
  });
  return { chunks, lookup };
}

function applyPolicyToSections(
  sections: ContextSection[],
  policy: DataAccessPolicy
): ContextSection[] {
  const { chunks, lookup } = buildPolicyChunks(sections);
  const filteredChunks = applyDataAccessPolicyToChunks(chunks, policy);
  if (filteredChunks.length === 0) {
    return [];
  }
  const filteredSections: ContextSection[] = [];
  for (const chunk of filteredChunks) {
    const original = lookup.get(chunk.block_id);
    if (!original) {
      continue;
    }
    filteredSections.push({
      ...original,
      text: chunk.content,
      truncated: original.originalLength > chunk.content.length || original.truncated,
    });
  }
  return filteredSections;
}
