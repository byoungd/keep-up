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
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { success: false, error: "Missing YAML frontmatter in SKILL.md" };
  }

  const frontmatterText = match[1];
  const body = match[2].trim();

  const parsed = parseFrontmatter(frontmatterText);
  if (!parsed.success) {
    return parsed;
  }

  const validated = validateFrontmatter(parsed.data, options);
  if (!validated.success) {
    return validated;
  }

  return { success: true, frontmatter: validated.frontmatter, body };
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

function parseFrontmatter(
  text: string
): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
  const data: Record<string, unknown> = {};
  const lines = text.split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (isIgnorableLine(trimmed)) {
      index += 1;
      continue;
    }

    const parsedLine = parseFrontmatterLine(line, index);
    if (!parsedLine.success) {
      return parsedLine;
    }

    if (!ALLOWED_FIELDS.has(parsedLine.key)) {
      return { success: false, error: `Unsupported frontmatter field: ${parsedLine.key}` };
    }

    const valueResult = parseFrontmatterValue(parsedLine.key, parsedLine.rawValue, lines, index);
    if (!valueResult.success) {
      return valueResult;
    }
    data[parsedLine.key] = valueResult.value;
    index = valueResult.nextIndex;
  }

  return { success: true, data };
}

function isIgnorableLine(trimmed: string): boolean {
  return trimmed.length === 0 || trimmed.startsWith("#");
}

function parseFrontmatterLine(
  line: string,
  index: number
): { success: true; key: string; rawValue: string } | { success: false; error: string } {
  if (/^\s+/.test(line)) {
    return { success: false, error: `Unexpected indentation at line ${index + 1}` };
  }

  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) {
    return { success: false, error: `Invalid frontmatter line ${index + 1}` };
  }

  const key = line.slice(0, colonIndex).trim();
  const rawValue = line.slice(colonIndex + 1).trim();

  return { success: true, key, rawValue };
}

function parseFrontmatterValue(
  key: string,
  rawValue: string,
  lines: string[],
  index: number
): { success: true; value: unknown; nextIndex: number } | { success: false; error: string } {
  if (rawValue !== "") {
    return { success: true, value: parseScalarValue(rawValue), nextIndex: index + 1 };
  }

  if (key === "metadata") {
    const metadataResult = parseMetadataBlock(lines, index + 1);
    if (!metadataResult.success) {
      return metadataResult;
    }
    return {
      success: true,
      value: metadataResult.value,
      nextIndex: metadataResult.nextIndex,
    };
  }

  if (key === "allowed-tools") {
    const listResult = parseListBlock(lines, index + 1);
    if (!listResult.success) {
      return listResult;
    }
    return { success: true, value: listResult.items, nextIndex: listResult.nextIndex };
  }

  return { success: true, value: "", nextIndex: index + 1 };
}

function parseMetadataBlock(
  lines: string[],
  startIndex: number
):
  | { success: true; value: Record<string, string>; nextIndex: number }
  | { success: false; error: string } {
  const metadata: Record<string, string> = {};
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (!/^\s+/.test(line)) {
      break;
    }

    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      index += 1;
      continue;
    }

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) {
      return { success: false, error: `Invalid metadata line ${index + 1}` };
    }

    const key = trimmed.slice(0, colonIndex).trim();
    const rawValue = trimmed.slice(colonIndex + 1).trim();

    if (!key) {
      return { success: false, error: `Invalid metadata key at line ${index + 1}` };
    }

    metadata[key] = stringifyScalar(rawValue);
    index += 1;
  }

  return { success: true, value: metadata, nextIndex: index };
}

function parseListBlock(
  lines: string[],
  startIndex: number
): { success: true; items: string[]; nextIndex: number } | { success: false; error: string } {
  const items: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (!/^\s+/.test(line)) {
      break;
    }

    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      index += 1;
      continue;
    }

    if (!trimmed.startsWith("-")) {
      return { success: false, error: `Invalid list item at line ${index + 1}` };
    }

    const item = trimmed.slice(1).trim();
    if (item.length > 0) {
      items.push(item);
    }
    index += 1;
  }

  return { success: true, items, nextIndex: index };
}

function parseScalarValue(value: string): string | string[] {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner.length === 0) {
      return [];
    }
    return inner
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return stringifyScalar(trimmed);
}

function stringifyScalar(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
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

  if (data["allowed-tools"] !== undefined) {
    const allowedResult = resolveAllowedTools(data["allowed-tools"]);
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
