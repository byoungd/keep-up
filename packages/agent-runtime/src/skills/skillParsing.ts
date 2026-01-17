import matter from "gray-matter";

export type SkillFrontmatter = {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: string[];
};

export type SkillValidationOptions = {
  compatibilityMaxLength?: number;
};

export type SkillParseOutcome =
  | { success: true; frontmatter: SkillFrontmatter; body: string }
  | { success: false; error: string };

const DEFAULT_COMPATIBILITY_MAX_LENGTH = 500;

const ALLOWED_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

export function parseSkillMarkdown(
  content: string,
  options?: SkillValidationOptions
): SkillParseOutcome {
  // Use gray-matter for robust YAML frontmatter parsing
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(content);
  } catch (err) {
    return { success: false, error: `Invalid YAML frontmatter: ${String(err)}` };
  }

  // Check if frontmatter was present
  if (Object.keys(parsed.data).length === 0) {
    return { success: false, error: "Missing YAML frontmatter in SKILL.md" };
  }

  // Validate allowed fields
  for (const key of Object.keys(parsed.data)) {
    if (!ALLOWED_FIELDS.has(key)) {
      return { success: false, error: `Unsupported frontmatter field: ${key}` };
    }
  }

  // Normalize allowed-tools to allowedTools
  const data = { ...parsed.data };
  if (data["allowed-tools"] !== undefined) {
    data.allowedTools = data["allowed-tools"];
    delete data["allowed-tools"];
  }

  const validated = validateFrontmatter(data, options);
  if (!validated.success) {
    return validated;
  }

  return { success: true, frontmatter: validated.frontmatter, body: parsed.content.trim() };
}

export function normalizeSkillName(name: string): string {
  return name.normalize("NFKC");
}

export function validateSkillName(name: string): string | null {
  const normalized = normalizeSkillName(name);
  if (normalized.length === 0 || normalized.length > 64) {
    return "Skill name must be between 1 and 64 characters";
  }
  if (normalized !== normalized.toLowerCase()) {
    return "Skill name must be lowercase";
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(normalized)) {
    return "Skill name must use lowercase letters, numbers, and hyphens";
  }
  if (normalized.includes("--")) {
    return "Skill name cannot contain consecutive hyphens";
  }
  return null;
}

function validateFrontmatter(
  data: Record<string, unknown>,
  options?: SkillValidationOptions
): { success: true; frontmatter: SkillFrontmatter } | { success: false; error: string } {
  const compatibilityMaxLength =
    options?.compatibilityMaxLength ?? DEFAULT_COMPATIBILITY_MAX_LENGTH;

  const nameResult = requireFrontmatterString(data, "name");
  if (!nameResult.success) {
    return nameResult;
  }

  const descriptionResult = requireFrontmatterString(data, "description");
  if (!descriptionResult.success) {
    return descriptionResult;
  }

  const nameError = validateSkillName(nameResult.value);
  if (nameError) {
    return { success: false, error: nameError };
  }

  if (descriptionResult.value.length > 1024) {
    return { success: false, error: "Skill description must be 1024 characters or fewer" };
  }

  const frontmatter: SkillFrontmatter = {
    name: normalizeSkillName(nameResult.value),
    description: descriptionResult.value,
  };

  const license = parseOptionalString(data.license);
  if (license) {
    frontmatter.license = license;
  }

  const compatibilityResult = resolveCompatibility(data.compatibility, compatibilityMaxLength);
  if (!compatibilityResult.success) {
    return compatibilityResult;
  }
  if (compatibilityResult.value) {
    frontmatter.compatibility = compatibilityResult.value;
  }

  const metadataResult = resolveMetadata(data.metadata);
  if (!metadataResult.success) {
    return metadataResult;
  }
  if (metadataResult.value) {
    frontmatter.metadata = metadataResult.value;
  }

  if (data.allowedTools !== undefined) {
    const allowedResult = resolveAllowedTools(data.allowedTools);
    if (!allowedResult.success) {
      return allowedResult;
    }
    frontmatter.allowedTools = allowedResult.value;
  }

  return { success: true, frontmatter };
}

type ValidationResult<T> = { success: true; value: T } | { success: false; error: string };

function requireFrontmatterString(
  data: Record<string, unknown>,
  key: "name" | "description"
): ValidationResult<string> {
  const value = typeof data[key] === "string" ? data[key].trim() : "";
  if (!value) {
    return {
      success: false,
      error: `Skill frontmatter is missing required field: ${key}`,
    };
  }
  return { success: true, value };
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveCompatibility(
  value: unknown,
  maxLength: number
): ValidationResult<string | undefined> {
  const compatibility = parseOptionalString(value);
  if (!compatibility) {
    return { success: true, value: undefined };
  }
  if (compatibility.length > maxLength) {
    return {
      success: false,
      error: `Skill compatibility must be ${maxLength} characters or fewer`,
    };
  }
  return { success: true, value: compatibility };
}

function resolveMetadata(value: unknown): ValidationResult<Record<string, string> | undefined> {
  if (value === undefined || value === null) {
    return { success: true, value: undefined };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { success: false, error: "Skill metadata must be a mapping of key/value strings" };
  }
  const metadata: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    metadata[key] = typeof entry === "string" ? entry : String(entry);
  }
  return { success: true, value: metadata };
}

function resolveAllowedTools(value: unknown): ValidationResult<string[]> {
  const allowedTools = normalizeAllowedTools(value);
  if (!allowedTools) {
    return { success: false, error: "allowed-tools must be a string or list of strings" };
  }
  return { success: true, value: allowedTools };
}

function normalizeAllowedTools(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const tools: string[] = [];
    for (const entry of value) {
      if (typeof entry !== "string") {
        return null;
      }
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        tools.push(trimmed);
      }
    }
    return tools;
  }

  if (typeof value === "string") {
    if (value.trim().length === 0) {
      return [];
    }
    return value
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return null;
}
