/**
 * LFCC v0.9 RC - AI Payload Sanitizer
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/01_Kernel_API_Specification.md Section 5.3
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/07_AI_Dry_Run_Pipeline_Design.md Section 2
 */

import { loadNativeAiSanitizer } from "./native.js";
import type { AIPayloadSanitizer, AISanitizationPolicyV1, SanitizedPayload } from "./types.js";

type SanitizeDiag = { kind: string; detail: string; severity?: "error" | "warning" };

/** Dangerous URL protocols */
const CRITICAL_PROTOCOLS = new Set(["vbscript:", "data:"]);

type AttributeMatch = { rawName: string; name: string; value: string };

const ALLOWED_TAGS = new Set([
  // Inline
  "span",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "code",
  "a",
  // Block
  "p",
  "blockquote",
  "ul",
  "ol",
  "li",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  // Optional
  "br",
  // Table (if allowed by policy)
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);

const VOID_TAGS = new Set([
  "br",
  "hr",
  "img",
  "input",
  "col",
  "source",
  "area",
  "base",
  "link",
  "meta",
]);

const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "title", "rel", "target"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
};

const URL_ATTRIBUTE_NAMES = new Set(["href", "src", "srcset", "poster", "xlink:href"]);

const TAG_REGEX = /<(\/?)([a-zA-Z][\w:-]*)(\s+(?:[^"'>]+|"[^"]*"|'[^']*')*)?>/g;

/**
 * Check if a URL is safe according to policy
 */
type UrlSafety = "safe" | "unsafe" | "critical";

function normalizeUrl(value: string): string {
  const lowered = value.trim().toLowerCase();
  let result = "";
  for (const char of lowered) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) {
      continue;
    }
    if (char.trim() === "") {
      continue;
    }
    result += char;
  }
  return result;
}

function normalizeProtocols(protocols: string[]): string[] {
  return protocols.map((proto) => proto.trim().toLowerCase());
}

function classifyUrl(
  url: string,
  allowedProtocols: string[] = ["https:", "http:", "mailto:"]
): UrlSafety {
  const normalized = normalizeUrl(url);

  for (const proto of CRITICAL_PROTOCOLS) {
    if (normalized.startsWith(proto)) {
      return "critical";
    }
  }

  const allowed = normalizeProtocols(allowedProtocols);
  for (const proto of allowed) {
    if (normalized.startsWith(proto)) {
      return "safe";
    }
  }

  if (normalized.startsWith("/") || normalized.startsWith("#") || !normalized.includes(":")) {
    return "safe";
  }

  return "unsafe";
}

function collectAttributeMatches(attrs: string): AttributeMatch[] {
  const attrRegex = /([a-zA-Z_][\w:-]*)\s*=\s*["']([^"']*)["']/g;
  const matches: AttributeMatch[] = [];
  let match: RegExpExecArray | null = attrRegex.exec(attrs);

  while (match !== null) {
    matches.push({
      rawName: match[1],
      name: match[1].toLowerCase(),
      value: match[2],
    });
    match = attrRegex.exec(attrs);
  }

  return matches;
}

type UrlSafetySummary = {
  status: UrlSafety;
  unsafeUrls: string[];
  criticalUrls: string[];
};

function parseSrcsetUrls(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter((entry) => entry.length > 0);
}

function resolveLimits(policy: AISanitizationPolicyV1) {
  const defaults = policy.limits ?? {};
  const fallbackBytes = policy.max_payload_size ?? 1024 * 1024;
  return {
    max_payload_bytes: defaults.max_payload_bytes ?? fallbackBytes,
    max_nesting_depth: defaults.max_nesting_depth ?? 100,
    max_attribute_count: defaults.max_attribute_count ?? 1000,
  };
}

function summarizeUrlSafety(
  name: string,
  value: string,
  policy: AISanitizationPolicyV1
): UrlSafetySummary {
  const urls = name === "srcset" ? parseSrcsetUrls(value) : [value];
  const unsafeUrls: string[] = [];
  const criticalUrls: string[] = [];

  for (const url of urls) {
    const status = classifyUrl(url, policy.allowed_url_protocols);
    if (status === "critical") {
      criticalUrls.push(url);
    } else if (status === "unsafe") {
      unsafeUrls.push(url);
    }
  }

  const status: UrlSafety =
    criticalUrls.length > 0 ? "critical" : unsafeUrls.length > 0 ? "unsafe" : "safe";

  return { status, unsafeUrls, criticalUrls };
}

function recordUrlFindings(
  name: string,
  summary: UrlSafetySummary,
  diagnostics: SanitizeDiag[],
  errors: Array<{ kind: string; detail: string }>
): void {
  for (const url of summary.criticalUrls) {
    errors.push({
      kind: "critical_security_violation",
      detail: `Critical URL in ${name}: ${url}`,
    });
  }

  if (summary.unsafeUrls.length > 0) {
    diagnostics.push({
      kind: "sanitized_url",
      detail: `Sanitized unsafe URL in ${name}`,
      severity: "warning",
    });
  }
}

function scanUrlAttributes(
  matches: AttributeMatch[],
  policy: AISanitizationPolicyV1,
  diagnostics: SanitizeDiag[],
  errors: Array<{ kind: string; detail: string }>
): void {
  for (const match of matches) {
    if (!URL_ATTRIBUTE_NAMES.has(match.name)) {
      continue;
    }
    const summary = summarizeUrlSafety(match.name, match.value, policy);
    if (summary.status !== "safe") {
      recordUrlFindings(match.name, summary, diagnostics, errors);
    }
  }
}

function sanitizeAttribute(
  match: AttributeMatch,
  allowedAttrs: Set<string>,
  policy: AISanitizationPolicyV1,
  diagnostics: SanitizeDiag[],
  errors: Array<{ kind: string; detail: string }>
): string | null {
  if (match.name.startsWith("on")) {
    diagnostics.push({
      kind: "removed_attr",
      detail: `Removed event handler attribute: ${match.name}`,
      severity: "warning",
    });
    return null;
  }

  if (match.name === "style") {
    diagnostics.push({
      kind: "removed_attr",
      detail: "Removed style attribute",
      severity: "warning",
    });
    return null;
  }

  if (URL_ATTRIBUTE_NAMES.has(match.name)) {
    const summary = summarizeUrlSafety(match.name, match.value, policy);
    if (summary.status !== "safe") {
      recordUrlFindings(match.name, summary, diagnostics, errors);
      return null;
    }
  }

  if (!allowedAttrs.has(match.name)) {
    diagnostics.push({
      kind: "removed_attr",
      detail: `Removed non-whitelisted attribute: ${match.name}`,
      severity: "warning",
    });
    return null;
  }

  return `${match.rawName}="${match.value}"`;
}

function filterAttributesForTag(
  tagName: string,
  matches: AttributeMatch[],
  policy: AISanitizationPolicyV1,
  diagnostics: SanitizeDiag[],
  errors: Array<{ kind: string; detail: string }>,
  maxAttrs: number
): string {
  if (matches.length === 0) {
    return "";
  }

  const allowedAttrs = ALLOWED_ATTRIBUTES[tagName] ?? new Set<string>();
  const filtered: string[] = [];
  const limit = Math.min(matches.length, maxAttrs);

  for (let i = 0; i < limit; i++) {
    const match = matches[i];
    if (!match) {
      continue;
    }
    const normalized = sanitizeAttribute(match, allowedAttrs, policy, diagnostics, errors);
    if (normalized) {
      filtered.push(normalized);
    }
  }

  return filtered.length > 0 ? ` ${filtered.join(" ")}` : "";
}

function updateDepth(
  state: { currentDepth: number; maxDepth: number },
  lowerTag: string,
  isClosing: boolean,
  isSelfClosing: boolean,
  errors: Array<{ kind: string; detail: string }>
): void {
  const isVoid = VOID_TAGS.has(lowerTag);
  if (!isClosing) {
    if (!isSelfClosing && !isVoid) {
      state.currentDepth += 1;
      if (state.currentDepth > state.maxDepth) {
        errors.push({
          kind: "limit_exceeded",
          detail: `Nesting depth exceeded: ${state.currentDepth} > ${state.maxDepth}`,
        });
      }
    }
    return;
  }

  if (!isVoid) {
    state.currentDepth = Math.max(0, state.currentDepth - 1);
  }
}

function sanitizeTagMatch(
  closing: string,
  tagName: string,
  attrs: string | undefined,
  policy: AISanitizationPolicyV1,
  diagnostics: SanitizeDiag[],
  errors: Array<{ kind: string; detail: string }>,
  state: { currentDepth: number; maxDepth: number; maxAttrs: number }
): string {
  const lowerTag = tagName.toLowerCase();
  const isClosing = closing === "/";
  const attrsValue = attrs ?? "";
  const isSelfClosing = attrsValue.trim().endsWith("/");

  updateDepth(state, lowerTag, isClosing, isSelfClosing, errors);

  if (isClosing) {
    return ALLOWED_TAGS.has(lowerTag) ? `</${tagName}>` : "";
  }

  const matches = attrsValue ? collectAttributeMatches(attrsValue) : [];
  if (matches.length > state.maxAttrs) {
    errors.push({
      kind: "limit_exceeded",
      detail: `Attribute count exceeded for <${tagName}>: ${matches.length} > ${state.maxAttrs}`,
    });
  }

  if (!ALLOWED_TAGS.has(lowerTag)) {
    if (matches.length > 0) {
      scanUrlAttributes(matches, policy, diagnostics, errors);
    }
    diagnostics.push({
      kind: "removed_tag",
      detail: `Removed non-whitelisted tag: <${tagName}>`,
      severity: "warning",
    });
    return "";
  }

  const filteredAttrs = matches.length
    ? filterAttributesForTag(lowerTag, matches, policy, diagnostics, errors, state.maxAttrs)
    : "";

  return `<${tagName}${filteredAttrs}>`;
}

function stripBlockedElements(html: string, diagnostics: SanitizeDiag[]): string {
  const blocked = /<\s*(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
  return html.replace(blocked, (_match, tagName: string) => {
    diagnostics.push({
      kind: "removed_tag",
      detail: `Removed blocked tag: <${tagName}>`,
      severity: "warning",
    });
    return "";
  });
}

/**
 * Simple HTML sanitizer using regex (for environments without DOM)
 * Note: For production, use a proper HTML parser like DOMPurify
 *
 * P0.1: Fail-closed - critical errors (e.g., vbscript:) must be reported as errors
 * P0.2: Whitelist-based - only allow explicitly permitted tags/attributes
 * P0.4: Limits enforcement (payload size, depth, attributes)
 */
function sanitizeHtmlString(
  html: string,
  policy: AISanitizationPolicyV1,
  diagnostics: SanitizeDiag[]
): { result: string; errors: Array<{ kind: string; detail: string }> } {
  let result = html;
  const errors: Array<{ kind: string; detail: string }> = [];

  // Limits from policy
  const limits = resolveLimits(policy);
  const maxDepth = limits.max_nesting_depth ?? 50;
  const maxAttrs = limits.max_attribute_count ?? 20;

  const state = { currentDepth: 0, maxDepth, maxAttrs };
  result = stripBlockedElements(result, diagnostics);
  result = result.replace(TAG_REGEX, (_match, closing: string, tagName: string, attrs: string) =>
    sanitizeTagMatch(closing, tagName, attrs, policy, diagnostics, errors, state)
  );

  return { result, errors };
}

/**
 * Create a whitelist-based HTML sanitizer
 */
export function createFallbackSanitizer(): AIPayloadSanitizer {
  return {
    sanitize(
      input: { html?: string; markdown?: string },
      policy: AISanitizationPolicyV1
    ): SanitizedPayload {
      const diagnostics: SanitizeDiag[] = [];
      const limits = resolveLimits(policy);

      // Check payload size
      const maxBytes = limits.max_payload_bytes ?? 1024 * 1024;
      const totalSize = (input.html?.length ?? 0) + (input.markdown?.length ?? 0);
      if (totalSize > maxBytes) {
        diagnostics.push({
          kind: "payload_too_large",
          detail: `Payload size ${totalSize} exceeds limit ${maxBytes}`,
        });
        return {
          diagnostics,
          errors: [{ kind: "payload_too_large", detail: "Payload too large" }],
        };
      }

      const result: SanitizedPayload = { diagnostics };

      if (input.html) {
        const sanitized = sanitizeHtmlString(input.html, policy, diagnostics);
        result.sanitized_html = sanitized.result;
        // P0.1: Fail-closed - collect errors from sanitization
        if (sanitized.errors.length > 0) {
          result.errors = sanitized.errors;
        }
      }

      if (input.markdown) {
        // Markdown is generally safer, but still check for HTML injection
        let md = input.markdown;

        // Remove any embedded HTML tags
        const htmlInMd = /<[^>]+>/g;
        if (htmlInMd.test(md)) {
          diagnostics.push({
            kind: "removed_html_in_md",
            detail: "Removed HTML tags from markdown",
          });
          md = md.replace(htmlInMd, "");
        }

        result.sanitized_markdown = md;
      }

      return result;
    },
  };
}

/**
 * Create a sanitizer, preferring native bindings when enabled/available.
 */
export function createSanitizer(): AIPayloadSanitizer {
  const native = loadNativeAiSanitizer();
  if (native) {
    const parseHtmlToInputTree =
      native.parseHtmlToInputTree as AIPayloadSanitizer["parseHtmlToInputTree"];
    return {
      sanitize: (input, policy) => native.sanitize(input, policy),
      parseHtmlToInputTree,
    };
  }

  return createFallbackSanitizer();
}
