/**
 * LFCC v0.9.1+ — Runtime Validation
 *
 * Comprehensive validation functions for all AI-Native types.
 * Use at API boundaries and for untrusted input.
 */

import type { AgentCapability, AgentType } from "./agentIdentity";
import { ALL_AGENT_CAPABILITIES, ALL_AGENT_TYPES } from "./agentIdentity";
import type { EditIntent } from "./intent";
import { ALL_INTENT_CATEGORIES } from "./intent";
import type { AIOpCode, AIOperationMeta, AIProvenance } from "./opcodes";
import { ALL_AI_OPCODES } from "./opcodes";
import type { ContentOrigin } from "./provenance";

// ============================================================================
// Validation Result
// ============================================================================

/**
 * Result of a validation operation.
 */
export interface AIValidationResult<T = unknown> {
  /** Whether validation passed */
  valid: boolean;

  /** Validated and typed value (if valid) */
  value?: T;

  /** Validation errors */
  errors: AIValidationError[];
}

/**
 * Single validation error.
 */
export interface AIValidationError {
  /** Path to the invalid field */
  path: string;

  /** Error message */
  message: string;

  /** Expected type or value */
  expected?: string;

  /** Actual value received */
  actual?: unknown;
}

// ============================================================================
// Validation Helpers
// ============================================================================

function createError(
  path: string,
  message: string,
  expected?: string,
  actual?: unknown
): AIValidationError {
  return { path, message, expected, actual };
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ============================================================================
// AIOpCode Validation
// ============================================================================

/**
 * Validate an AIOpCode
 */
export function validateAIOpCode(value: unknown): AIValidationResult<AIOpCode> {
  const errors: AIValidationError[] = [];

  if (!isString(value)) {
    errors.push(createError("", "AIOpCode must be a string", "string", typeof value));
    return { valid: false, errors };
  }

  if (!ALL_AI_OPCODES.includes(value as AIOpCode)) {
    errors.push(
      createError("", `Invalid AIOpCode: ${value}`, `one of ${ALL_AI_OPCODES.join(", ")}`, value)
    );
    return { valid: false, errors };
  }

  return { valid: true, value: value as AIOpCode, errors: [] };
}

// ============================================================================
// AIProvenance Validation
// ============================================================================

/**
 * Validate AIProvenance
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: comprehensive validation requires multiple field checks
export function validateAIProvenance(value: unknown): AIValidationResult<AIProvenance> {
  const errors: AIValidationError[] = [];

  if (!isObject(value)) {
    errors.push(createError("", "AIProvenance must be an object", "object", typeof value));
    return { valid: false, errors };
  }

  if (!isString(value.model_id) || value.model_id.length === 0) {
    errors.push(createError("model_id", "model_id must be a non-empty string"));
  }

  if (
    value.prompt_hash !== undefined &&
    (!isString(value.prompt_hash) || value.prompt_hash.length === 0)
  ) {
    errors.push(createError("prompt_hash", "prompt_hash must be a non-empty string"));
  }

  if (value.prompt_template_id !== undefined && !isString(value.prompt_template_id)) {
    errors.push(createError("prompt_template_id", "prompt_template_id must be a string"));
  }

  if (
    value.temperature !== undefined &&
    (!isNumber(value.temperature) || value.temperature < 0 || value.temperature > 2)
  ) {
    errors.push(
      createError(
        "temperature",
        "temperature must be a number between 0 and 2",
        "0-2",
        value.temperature
      )
    );
  }

  if (value.input_context_hashes !== undefined) {
    if (!Array.isArray(value.input_context_hashes)) {
      errors.push(createError("input_context_hashes", "input_context_hashes must be an array"));
    } else if (value.input_context_hashes.some((hash) => !isString(hash) || hash.length === 0)) {
      errors.push(
        createError("input_context_hashes", "input_context_hashes must contain non-empty strings")
      );
    }
  }

  if (value.rationale_summary !== undefined && !isString(value.rationale_summary)) {
    errors.push(createError("rationale_summary", "rationale_summary must be a string"));
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, value: value as unknown as AIProvenance, errors: [] };
}

// ============================================================================
// AIOperationMeta Validation
// ============================================================================

/**
 * Validate AIOperationMeta
 */
export function validateAIOperationMeta(value: unknown): AIValidationResult<AIOperationMeta> {
  const errors: AIValidationError[] = [];

  if (!isObject(value)) {
    errors.push(createError("", "AIOperationMeta must be an object", "object", typeof value));
    return { valid: false, errors };
  }

  // Validate op_code
  const opCodeResult = validateAIOpCode(value.op_code);
  if (!opCodeResult.valid) {
    errors.push(
      ...opCodeResult.errors.map((e) => ({ ...e, path: e.path ? `op_code.${e.path}` : "op_code" }))
    );
  }

  // Validate agent_id
  if (!isString(value.agent_id) || value.agent_id.length === 0) {
    errors.push(createError("agent_id", "agent_id must be a non-empty string"));
  }

  const hasIntentId = isString(value.intent_id) && value.intent_id.length > 0;
  const hasIntent = value.intent !== undefined;
  if (!hasIntentId && !hasIntent) {
    errors.push(createError("intent_id", "intent_id or intent must be provided"));
  }

  if (hasIntent) {
    const intentResult = validateEditIntent(value.intent);
    if (!intentResult.valid) {
      errors.push(
        ...intentResult.errors.map((e) => ({
          ...e,
          path: e.path ? `intent.${e.path}` : "intent",
        }))
      );
    }
  }

  // Validate provenance
  const provResult = validateAIProvenance(value.provenance);
  if (!provResult.valid) {
    errors.push(
      ...provResult.errors.map((e) => ({
        ...e,
        path: e.path ? `provenance.${e.path}` : "provenance",
      }))
    );
  }

  // Validate confidence
  if (!isObject(value.confidence)) {
    errors.push(createError("confidence", "confidence must be an object"));
  } else if (
    !isNumber(value.confidence.score) ||
    value.confidence.score < 0 ||
    value.confidence.score > 1
  ) {
    errors.push(
      createError("confidence.score", "confidence.score must be a number between 0 and 1")
    );
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, value: value as unknown as AIOperationMeta, errors: [] };
}

// ============================================================================
// EditIntent Validation
// ============================================================================

/**
 * Validate EditIntent
 */
export function validateEditIntent(value: unknown): AIValidationResult<EditIntent> {
  const errors: AIValidationError[] = [];

  if (!isObject(value)) {
    errors.push(createError("", "EditIntent must be an object", "object", typeof value));
    return { valid: false, errors };
  }

  if (!isString(value.id) || value.id.length === 0) {
    errors.push(createError("id", "id must be a non-empty string"));
  }

  if (
    !isString(value.category) ||
    !ALL_INTENT_CATEGORIES.includes(value.category as EditIntent["category"])
  ) {
    errors.push(
      createError("category", `category must be one of ${ALL_INTENT_CATEGORIES.join(", ")}`)
    );
  }

  if (!isObject(value.description)) {
    errors.push(createError("description", "description must be an object"));
  } else {
    if (!isString(value.description.short)) {
      errors.push(createError("description.short", "description.short must be a string"));
    }
    if (!isString(value.description.locale)) {
      errors.push(createError("description.locale", "description.locale must be a string"));
    }
  }

  if (!isObject(value.structured)) {
    errors.push(createError("structured", "structured must be an object"));
  } else if (!isString(value.structured.action)) {
    errors.push(createError("structured.action", "structured.action must be a string"));
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, value: value as unknown as EditIntent, errors: [] };
}

// ============================================================================
// ContentOrigin Validation
// ============================================================================

const VALID_ORIGINS: ContentOrigin[] = ["human", "ai", "ai_assisted", "mixed"];

/**
 * Validate ContentOrigin
 */
export function validateContentOrigin(value: unknown): AIValidationResult<ContentOrigin> {
  if (!isString(value) || !VALID_ORIGINS.includes(value as ContentOrigin)) {
    return {
      valid: false,
      errors: [
        createError(
          "",
          `ContentOrigin must be one of ${VALID_ORIGINS.join(", ")}`,
          VALID_ORIGINS.join("|"),
          value
        ),
      ],
    };
  }
  return { valid: true, value: value as ContentOrigin, errors: [] };
}

// ============================================================================
// AgentType Validation
// ============================================================================

/**
 * Validate AgentType
 */
export function validateAgentType(value: unknown): AIValidationResult<AgentType> {
  if (!isString(value) || !ALL_AGENT_TYPES.includes(value as AgentType)) {
    return {
      valid: false,
      errors: [createError("", `AgentType must be one of ${ALL_AGENT_TYPES.join(", ")}`)],
    };
  }
  return { valid: true, value: value as AgentType, errors: [] };
}

// ============================================================================
// AgentCapability Validation
// ============================================================================

/**
 * Validate AgentCapability
 */
export function validateAgentCapability(value: unknown): AIValidationResult<AgentCapability> {
  if (!isString(value) || !ALL_AGENT_CAPABILITIES.includes(value as AgentCapability)) {
    return {
      valid: false,
      errors: [
        createError("", `AgentCapability must be one of ${ALL_AGENT_CAPABILITIES.join(", ")}`),
      ],
    };
  }
  return { valid: true, value: value as AgentCapability, errors: [] };
}

// ============================================================================
// Batch Validation
// ============================================================================

/**
 * Validate an array of items
 */
export function validateArray<T>(
  items: unknown[],
  validator: (item: unknown) => AIValidationResult<T>,
  path = ""
): AIValidationResult<T[]> {
  const results: T[] = [];
  const errors: AIValidationError[] = [];

  for (let i = 0; i < items.length; i++) {
    const result = validator(items[i]);
    if (result.valid && result.value !== undefined) {
      results.push(result.value);
    } else {
      errors.push(
        ...result.errors.map((e: AIValidationError) => ({
          ...e,
          path: e.path ? `${path}[${i}].${e.path}` : `${path}[${i}]`,
        }))
      );
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, value: results, errors: [] };
}
