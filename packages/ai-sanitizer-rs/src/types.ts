export type SanitizerInput = {
  html?: string;
  markdown?: string;
};

export type SanitizationLimits = {
  max_payload_bytes?: number;
  max_nesting_depth?: number;
  max_attribute_count?: number;
};

export type SanitizationPolicy = {
  allowed_url_protocols?: string[];
  max_payload_size?: number;
  limits?: SanitizationLimits;
};

export type SanitizationDiagnostic = {
  kind: string;
  detail: string;
  severity?: "error" | "warning";
};

export type SanitizationError = {
  kind: string;
  detail: string;
};

export type SanitizedPayload = {
  sanitized_html?: string;
  sanitized_markdown?: string;
  diagnostics: SanitizationDiagnostic[];
  errors?: SanitizationError[];
};

export type NativeAiSanitizer = {
  sanitize: (input: SanitizerInput, policy: SanitizationPolicy) => SanitizedPayload;
  parseHtmlToInputTree?: (html: string) => unknown;
};
