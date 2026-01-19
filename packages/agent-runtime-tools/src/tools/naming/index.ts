/**
 * Tool Naming Hardening
 *
 * Implements LFCC v0.9.1 tool naming conventions and validation.
 * Ensures all AI operations follow the OP_AI_* naming pattern.
 */

// Re-export envelope types
export * from "./envelope";

// ============================================================================
// Tool Naming Patterns
// ============================================================================

/**
 * Tool category prefixes for organized naming.
 */
export type ToolCategory =
  | "ai" // AI operations (OP_AI_*)
  | "doc" // Document operations
  | "edit" // Editing operations
  | "search" // Search operations
  | "system" // System operations
  | "external"; // External integrations

/**
 * AI operation prefixes following LFCC v0.9.1 spec.
 */
export const AI_OP_PREFIX = "OP_AI_" as const;

/**
 * All valid AI operation codes from LFCC v0.9.1.
 */
export const VALID_AI_OPCODES = [
  // Content Generation
  "OP_AI_GENERATE",
  "OP_AI_EXPAND",
  "OP_AI_SUMMARIZE",

  // Content Modification
  "OP_AI_REWRITE",
  "OP_AI_TRANSLATE",
  "OP_AI_REFINE",
  "OP_AI_CORRECT",

  // Structural Operations
  "OP_AI_RESTRUCTURE",
  "OP_AI_FORMAT",
  "OP_AI_SPLIT_MERGE",

  // Review Operations
  "OP_AI_REVIEW",
  "OP_AI_SUGGEST",
  "OP_AI_VALIDATE",

  // Collaboration Operations
  "OP_AI_HANDOFF",
  "OP_AI_DELEGATE",
  "OP_AI_MERGE_RESOLVE",
] as const;

export type ValidAIOpCode = (typeof VALID_AI_OPCODES)[number];

// ============================================================================
// Tool Naming Validation
// ============================================================================

/**
 * Tool naming validation result.
 */
export interface ToolNameValidationResult {
  valid: boolean;
  normalized: string;
  category: ToolCategory | null;
  errors: string[];
  warnings: string[];
}

/**
 * Tool naming rules configuration.
 */
export interface ToolNamingRules {
  /** Maximum tool name length */
  maxLength: number;
  /** Minimum tool name length */
  minLength: number;
  /** Allowed characters pattern */
  allowedPattern: RegExp;
  /** Reserved prefixes that require special handling */
  reservedPrefixes: string[];
  /** Whether to enforce AI operation naming for AI tools */
  enforceAIOpNaming: boolean;
}

/**
 * Default tool naming rules.
 */
export const DEFAULT_NAMING_RULES: ToolNamingRules = {
  maxLength: 64,
  minLength: 2,
  allowedPattern: /^[a-zA-Z][a-zA-Z0-9_]*$/,
  reservedPrefixes: ["OP_AI_", "SYSTEM_", "INTERNAL_"],
  enforceAIOpNaming: true,
};

/**
 * Validates a tool name against naming rules.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validation logic with multiple category checks
export function validateToolName(
  name: string,
  rules: ToolNamingRules = DEFAULT_NAMING_RULES
): ToolNameValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let category: ToolCategory | null = null;

  // Check length
  if (name.length < rules.minLength) {
    errors.push(`Tool name too short: ${name.length} < ${rules.minLength}`);
  }
  if (name.length > rules.maxLength) {
    errors.push(`Tool name too long: ${name.length} > ${rules.maxLength}`);
  }

  // Check pattern
  if (!rules.allowedPattern.test(name)) {
    errors.push(`Tool name contains invalid characters. Must match: ${rules.allowedPattern}`);
  }

  // Determine category
  if (name.startsWith(AI_OP_PREFIX)) {
    category = "ai";
    // Validate AI op code
    if (!isValidAIOpCode(name)) {
      errors.push(
        `Invalid AI operation code: ${name}. Must be one of: ${VALID_AI_OPCODES.join(", ")}`
      );
    }
  } else if (name.startsWith("doc_") || name.startsWith("document_")) {
    category = "doc";
  } else if (name.startsWith("edit_") || name.startsWith("update_")) {
    category = "edit";
  } else if (name.startsWith("search_") || name.startsWith("find_")) {
    category = "search";
  } else if (name.startsWith("system_") || name.startsWith("SYSTEM_")) {
    category = "system";
    warnings.push("System tools should be used with caution");
  } else if (name.startsWith("external_") || name.includes(":")) {
    category = "external";
  }

  // Check reserved prefixes
  for (const prefix of rules.reservedPrefixes) {
    if (name.startsWith(prefix) && category !== "ai" && category !== "system") {
      warnings.push(`Tool uses reserved prefix: ${prefix}`);
    }
  }

  // Normalize name (lowercase for non-AI operations)
  const normalized = category === "ai" ? name : name.toLowerCase();

  return {
    valid: errors.length === 0,
    normalized,
    category,
    errors,
    warnings,
  };
}

/**
 * Checks if a string is a valid AI operation code.
 */
export function isValidAIOpCode(code: string): code is ValidAIOpCode {
  return VALID_AI_OPCODES.includes(code as ValidAIOpCode);
}

/**
 * Converts a descriptive action to an AI operation code.
 */
export function actionToAIOpCode(action: string): ValidAIOpCode | null {
  const actionMap: Record<string, ValidAIOpCode> = {
    // Generation
    generate: "OP_AI_GENERATE",
    create: "OP_AI_GENERATE",
    write: "OP_AI_GENERATE",
    expand: "OP_AI_EXPAND",
    elaborate: "OP_AI_EXPAND",
    summarize: "OP_AI_SUMMARIZE",
    condense: "OP_AI_SUMMARIZE",

    // Modification
    rewrite: "OP_AI_REWRITE",
    rephrase: "OP_AI_REWRITE",
    translate: "OP_AI_TRANSLATE",
    refine: "OP_AI_REFINE",
    polish: "OP_AI_REFINE",
    improve: "OP_AI_REFINE",
    correct: "OP_AI_CORRECT",
    fix: "OP_AI_CORRECT",

    // Structure
    restructure: "OP_AI_RESTRUCTURE",
    reorganize: "OP_AI_RESTRUCTURE",
    format: "OP_AI_FORMAT",
    split: "OP_AI_SPLIT_MERGE",
    merge: "OP_AI_SPLIT_MERGE",

    // Review
    review: "OP_AI_REVIEW",
    comment: "OP_AI_REVIEW",
    suggest: "OP_AI_SUGGEST",
    recommend: "OP_AI_SUGGEST",
    validate: "OP_AI_VALIDATE",
    verify: "OP_AI_VALIDATE",

    // Collaboration
    handoff: "OP_AI_HANDOFF",
    delegate: "OP_AI_DELEGATE",
    resolve: "OP_AI_MERGE_RESOLVE",
  };

  const normalized = action.toLowerCase().replace(/[-\s]/g, "_");
  return actionMap[normalized] ?? null;
}

// ============================================================================
// Tool Registry Validation
// ============================================================================

/**
 * Tool registration validation result.
 */
export interface ToolRegistrationValidation {
  toolName: string;
  nameValidation: ToolNameValidationResult;
  hasDescription: boolean;
  hasInputSchema: boolean;
  hasCategory: boolean;
  isCompliant: boolean;
  complianceIssues: string[];
}

/**
 * Validates a tool for LFCC v0.9.1 compliance.
 */
export function validateToolRegistration(tool: {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: { category?: string };
}): ToolRegistrationValidation {
  const nameValidation = validateToolName(tool.name);
  const complianceIssues: string[] = [...nameValidation.errors];

  const hasDescription = Boolean(tool.description && tool.description.length > 0);
  const hasInputSchema = Boolean(tool.inputSchema);
  const hasCategory = Boolean(tool.annotations?.category);

  if (!hasDescription) {
    complianceIssues.push("Tool missing description");
  }

  if (!hasInputSchema) {
    complianceIssues.push("Tool missing input schema");
  }

  if (!hasCategory && nameValidation.category === "ai") {
    complianceIssues.push("AI tool should have category annotation");
  }

  return {
    toolName: tool.name,
    nameValidation,
    hasDescription,
    hasInputSchema,
    hasCategory,
    isCompliant: complianceIssues.length === 0,
    complianceIssues,
  };
}

// ============================================================================
// AI Operation Envelope Helpers
// ============================================================================

/**
 * Creates a standardized AI operation name.
 */
export function createAIOperationName(baseAction: string, variant?: string): string {
  const opCode = actionToAIOpCode(baseAction);
  if (opCode) {
    return variant ? `${opCode}:${variant}` : opCode;
  }
  // Fallback to custom naming
  const normalized = baseAction.toUpperCase().replace(/[-\s]/g, "_");
  return variant ? `OP_AI_${normalized}:${variant}` : `OP_AI_${normalized}`;
}

/**
 * Parses an AI operation name into its components.
 */
export function parseAIOperationName(name: string): {
  opCode: string;
  variant?: string;
  isValid: boolean;
} {
  const [opCode, variant] = name.split(":");
  return {
    opCode,
    variant,
    isValid: isValidAIOpCode(opCode),
  };
}

/**
 * Gets the human-readable label for an AI operation code.
 */
export function getAIOpCodeLabel(opCode: ValidAIOpCode): string {
  const labels: Record<ValidAIOpCode, string> = {
    OP_AI_GENERATE: "Generate Content",
    OP_AI_EXPAND: "Expand Content",
    OP_AI_SUMMARIZE: "Summarize",
    OP_AI_REWRITE: "Rewrite",
    OP_AI_TRANSLATE: "Translate",
    OP_AI_REFINE: "Refine",
    OP_AI_CORRECT: "Correct Errors",
    OP_AI_RESTRUCTURE: "Restructure",
    OP_AI_FORMAT: "Format",
    OP_AI_SPLIT_MERGE: "Split/Merge",
    OP_AI_REVIEW: "Review",
    OP_AI_SUGGEST: "Suggest",
    OP_AI_VALIDATE: "Validate",
    OP_AI_HANDOFF: "Agent Handoff",
    OP_AI_DELEGATE: "Delegate Task",
    OP_AI_MERGE_RESOLVE: "Resolve Conflict",
  };
  return labels[opCode];
}

/**
 * Gets the category for an AI operation code.
 */
export function getAIOpCodeCategory(
  opCode: ValidAIOpCode
): "generation" | "modification" | "structure" | "review" | "collaboration" {
  const categories: Record<
    ValidAIOpCode,
    "generation" | "modification" | "structure" | "review" | "collaboration"
  > = {
    OP_AI_GENERATE: "generation",
    OP_AI_EXPAND: "generation",
    OP_AI_SUMMARIZE: "generation",
    OP_AI_REWRITE: "modification",
    OP_AI_TRANSLATE: "modification",
    OP_AI_REFINE: "modification",
    OP_AI_CORRECT: "modification",
    OP_AI_RESTRUCTURE: "structure",
    OP_AI_FORMAT: "structure",
    OP_AI_SPLIT_MERGE: "structure",
    OP_AI_REVIEW: "review",
    OP_AI_SUGGEST: "review",
    OP_AI_VALIDATE: "review",
    OP_AI_HANDOFF: "collaboration",
    OP_AI_DELEGATE: "collaboration",
    OP_AI_MERGE_RESOLVE: "collaboration",
  };
  return categories[opCode];
}
