import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  NativeAiSanitizer,
  SanitizationPolicy,
  SanitizedPayload,
  SanitizerInput,
} from "./types";

interface NativeBinding {
  sanitize: (input: SanitizerInput, policy: NativeSanitizationPolicy) => NativeSanitizedPayload;
  parseHtmlToInputTree?: (html: string) => unknown;
  parse_html_to_input_tree?: (html: string) => unknown;
}

let cachedSanitizer: NativeAiSanitizer | null | undefined;
let cachedError: Error | null = null;

function resolvePackageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

function readBooleanFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isNativeDisabled(): boolean {
  return readBooleanFlag(process.env.KU0_AI_SANITIZER_DISABLE_NATIVE);
}

function buildCandidatePaths(packageRoot: string): string[] {
  const platformArch = `${process.platform}-${process.arch}`;
  const candidates: string[] = [];
  const names = ["ai_sanitizer_rs", "ai-sanitizer-rs", "index"];

  for (const name of names) {
    candidates.push(join(packageRoot, `${name}.${platformArch}.node`));
    candidates.push(join(packageRoot, `${name}.node`));
    candidates.push(join(packageRoot, "native", `${name}.${platformArch}.node`));
    candidates.push(join(packageRoot, "native", `${name}.node`));
    candidates.push(join(packageRoot, "native", "target", "release", `${name}.node`));
    candidates.push(join(packageRoot, "native", "target", "debug", `${name}.node`));
    candidates.push(join(packageRoot, "npm", platformArch, `${name}.${platformArch}.node`));
    candidates.push(join(packageRoot, "npm", platformArch, `${name}.node`));
  }

  return candidates;
}

function loadBinding(): NativeBinding | null {
  const require = createRequire(import.meta.url);
  const packageRoot = resolvePackageRoot();
  const candidates = buildCandidatePaths(packageRoot);
  const envPath = process.env.KU0_AI_SANITIZER_NATIVE_PATH;
  if (envPath) {
    candidates.unshift(envPath);
  }

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      return require(candidate) as NativeBinding;
    } catch (error) {
      cachedError = error instanceof Error ? error : new Error(String(error));
    }
  }

  return null;
}

type NativeSanitizationLimits = {
  maxPayloadBytes?: number;
  maxNestingDepth?: number;
  maxAttributeCount?: number;
};

type NativeSanitizationPolicy = {
  allowedUrlProtocols?: string[];
  maxPayloadSize?: number;
  limits?: NativeSanitizationLimits;
};

type NativeSanitizedPayload = {
  sanitizedHtml?: string | null;
  sanitizedMarkdown?: string | null;
  diagnostics: SanitizedPayload["diagnostics"];
  errors?: SanitizedPayload["errors"] | null;
};

function toNativePolicy(policy: SanitizationPolicy): NativeSanitizationPolicy {
  return {
    allowedUrlProtocols: policy.allowed_url_protocols,
    maxPayloadSize: policy.max_payload_size,
    limits: policy.limits
      ? {
          maxPayloadBytes: policy.limits.max_payload_bytes,
          maxNestingDepth: policy.limits.max_nesting_depth,
          maxAttributeCount: policy.limits.max_attribute_count,
        }
      : undefined,
  };
}

function fromNativePayload(payload: NativeSanitizedPayload): SanitizedPayload {
  return {
    sanitized_html: payload.sanitizedHtml ?? undefined,
    sanitized_markdown: payload.sanitizedMarkdown ?? undefined,
    diagnostics: payload.diagnostics,
    errors: payload.errors ?? undefined,
  };
}

export function getNativeAiSanitizer(): NativeAiSanitizer | null {
  if (isNativeDisabled()) {
    cachedSanitizer = null;
    return null;
  }

  if (cachedSanitizer !== undefined) {
    return cachedSanitizer;
  }

  const binding = loadBinding();
  if (!binding) {
    cachedSanitizer = null;
    return null;
  }

  const parseHtmlToInputTree = binding.parseHtmlToInputTree ?? binding.parse_html_to_input_tree;

  cachedSanitizer = {
    sanitize: (input, policy) => {
      const result = binding.sanitize(input, toNativePolicy(policy)) as NativeSanitizedPayload;
      return fromNativePayload(result);
    },
    parseHtmlToInputTree,
  };

  return cachedSanitizer;
}

export function getNativeAiSanitizerError(): Error | null {
  return cachedError;
}

export type {
  NativeAiSanitizer,
  SanitizationDiagnostic,
  SanitizationError,
  SanitizationLimits,
  SanitizationPolicy,
  SanitizedPayload,
  SanitizerInput,
} from "./types";
