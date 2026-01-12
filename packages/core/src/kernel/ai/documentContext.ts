/**
 * LFCC v0.9.1+ — Document-Aware AI Context
 *
 * Persistent context for AI understanding of document structure, style,
 * and interaction history.
 *
 * @see docs/specs/proposals/LFCC_v0.9.1_AI_Native_Enhancement.md
 */

import type { EditIntent } from "./intent";
import type { DataAccessPolicy } from "./types";

// ============================================================================
// Document Structure
// ============================================================================

/**
 * Document outline entry.
 */
export interface OutlineEntry {
  /** Block ID */
  block_id: string;

  /** Heading level (1-6) */
  level: number;

  /** Heading text */
  text: string;

  /** Child entries */
  children?: OutlineEntry[];
}

/**
 * Document outline.
 */
export interface DocumentOutline {
  /** Root entries */
  entries: OutlineEntry[];

  /** Total heading count */
  total_headings: number;

  /** Maximum depth */
  max_depth: number;
}

// ============================================================================
// Entities and Relationships
// ============================================================================

/**
 * Entity type.
 */
export type EntityType =
  | "person"
  | "organization"
  | "location"
  | "date"
  | "concept"
  | "product"
  | "event"
  | "custom";

/**
 * Extracted entity.
 */
export interface Entity {
  /** Entity text */
  text: string;

  /** Entity type */
  type: EntityType;

  /** Blocks where this entity appears */
  occurrences: string[];

  /** Salience score (0-1) */
  salience: number;
}

/**
 * Relationship between entities.
 */
export interface EntityRelation {
  /** Source entity */
  source: string;

  /** Relation type */
  relation: string;

  /** Target entity */
  target: string;

  /** Confidence (0-1) */
  confidence: number;
}

// ============================================================================
// Style Fingerprint
// ============================================================================

/**
 * Tone classification.
 */
export type Tone = "formal" | "casual" | "technical" | "creative" | "neutral";

/**
 * Vocabulary level.
 */
export type VocabularyLevel = "simple" | "moderate" | "advanced";

/**
 * Style pattern.
 */
export interface StylePattern {
  /** Pattern name */
  name: string;

  /** Examples */
  examples: string[];

  /** Frequency (0-1) */
  frequency: number;
}

/**
 * Document style fingerprint.
 */
export interface StyleFingerprint {
  /** Detected tone */
  tone: Tone;

  /** Average sentence length */
  avg_sentence_length: number;

  /** Vocabulary level */
  vocabulary_level: VocabularyLevel;

  /** Detected patterns */
  detected_patterns: StylePattern[];
}

// ============================================================================
// Interaction Memory
// ============================================================================

/**
 * User preference learned from feedback.
 */
export interface UserPreference {
  /** Preference key */
  key: string;

  /** Preference value */
  value: string;

  /** Confidence (0-1) */
  confidence: number;

  /** When learned */
  learned_at: number;
}

/**
 * Rejected suggestion (to avoid repeating).
 */
export interface RejectedSuggestion {
  /** Original suggestion */
  suggestion: string;

  /** Why rejected (if known) */
  reason?: string;

  /** Rejection timestamp */
  rejected_at: number;
}

/**
 * Interaction memory.
 */
export interface InteractionMemory {
  /** Recent intents */
  recent_intents: EditIntent[];

  /** Learned preferences */
  user_preferences: UserPreference[];

  /** Rejected suggestions */
  rejected_suggestions: RejectedSuggestion[];

  /** Maximum items to remember */
  max_items: number;
}

// ============================================================================
// Focus Areas
// ============================================================================

/**
 * Active focus areas in the document.
 */
export interface FocusAreas {
  /** Current section being edited */
  current_section?: string;

  /** Blocks user is actively working on */
  attention_blocks: string[];

  /** Semantically related blocks */
  related_blocks: string[];

  /** Last focus update */
  updated_at: number;
}

// ============================================================================
// AI Document Context
// ============================================================================

/**
 * Complete AI context for document understanding.
 */
export interface AIDocumentContext {
  /** Document ID */
  document_id: string;

  /** Structural understanding */
  structure: {
    outline: DocumentOutline;
    key_entities: Entity[];
    relationships: EntityRelation[];
  };

  /** Style fingerprint */
  style: StyleFingerprint;

  /** Interaction memory */
  memory: InteractionMemory;

  /** Focus areas */
  focus: FocusAreas;

  /** Context version (for cache invalidation) */
  version: number;

  /** Last updated */
  updated_at: number;
}

// ============================================================================
// Context-Aware Prompting
// ============================================================================

/**
 * Content chunk for context injection.
 */
export interface ContentChunk {
  /** Block ID */
  block_id: string;

  /** Content text */
  content: string;

  /** Relevance score (0-1) */
  relevance: number;
}

/**
 * Token budget allocation.
 */
export interface TokenBudget {
  /** Total maximum tokens for context */
  max_tokens: number;

  /** Allocation for structure summary */
  structure_allocation: number;

  /** Allocation for relevant content */
  content_allocation: number;

  /** Allocation for style guidance */
  style_allocation: number;
}

/**
 * Context-aware prompt builder.
 */
export interface ContextAwarePrompt {
  /** Base prompt */
  base_prompt: string;

  /** Auto-injected context */
  injected_context: {
    /** Document structure summary */
    structure_summary: string;

    /** Relevant prior content */
    relevant_content: ContentChunk[];

    /** Style guidance */
    style_guidance: string;

    /** User preference hints */
    preference_hints: string[];
  };

  /** Token budget */
  token_budget: TokenBudget;
}

// ============================================================================
// Data Access Policy (Redaction)
// ============================================================================

const PII_PATTERNS: RegExp[] = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,
];

function containsPII(text: string): boolean {
  return PII_PATTERNS.some((pattern) => pattern.test(text));
}

function maskPII(text: string): string {
  let masked = text;
  for (const pattern of PII_PATTERNS) {
    masked = masked.replace(pattern, "[REDACTED]");
  }
  return masked;
}

function redactText(text: string, policy: DataAccessPolicy): string | null {
  if (!text) {
    return text;
  }
  if (!containsPII(text) || policy.pii_handling === "allow") {
    return text;
  }
  if (policy.pii_handling === "mask") {
    return maskPII(text);
  }
  if (policy.redaction_strategy === "mask") {
    return "[REDACTED]";
  }
  return null;
}

function truncateToLimit(text: string, limit: number): string {
  if (limit <= 0) {
    return "";
  }
  if (text.length <= limit) {
    return text;
  }
  return text.slice(0, limit);
}

function isBlockAllowed(blockId: string, policy: DataAccessPolicy): boolean {
  if (policy.allow_blocks && policy.allow_blocks.length > 0) {
    if (!policy.allow_blocks.includes(blockId)) {
      return false;
    }
  }
  if (policy.deny_blocks && policy.deny_blocks.length > 0) {
    if (policy.deny_blocks.includes(blockId)) {
      return false;
    }
  }
  return true;
}

/**
 * Apply data access policy to a context-aware prompt.
 * Enforces allow/deny lists, PII handling, and max context size.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: policy enforcement requires multiple decision branches
export function applyDataAccessPolicy(
  prompt: ContextAwarePrompt,
  policy: DataAccessPolicy
): ContextAwarePrompt {
  const maxChars = Math.max(0, policy.max_context_chars);
  let remaining = maxChars;

  const structureSummaryRaw = redactText(prompt.injected_context.structure_summary, policy) ?? "";
  const structureSummary = truncateToLimit(structureSummaryRaw, remaining);
  remaining -= structureSummary.length;

  const styleGuidanceRaw = redactText(prompt.injected_context.style_guidance, policy) ?? "";
  const styleGuidance = truncateToLimit(styleGuidanceRaw, remaining);
  remaining -= styleGuidance.length;

  const preferenceHints: string[] = [];
  for (const hint of prompt.injected_context.preference_hints) {
    if (remaining <= 0) {
      break;
    }
    const redacted = redactText(hint, policy);
    if (redacted === null) {
      continue;
    }
    const truncated = truncateToLimit(redacted, remaining);
    if (truncated.length === 0) {
      break;
    }
    preferenceHints.push(truncated);
    remaining -= truncated.length;
  }

  const relevantContent: ContentChunk[] = [];
  for (const chunk of prompt.injected_context.relevant_content) {
    if (remaining <= 0) {
      break;
    }
    if (!isBlockAllowed(chunk.block_id, policy)) {
      continue;
    }
    const redacted = redactText(chunk.content, policy);
    if (redacted === null) {
      continue;
    }
    const truncated = truncateToLimit(redacted, remaining);
    if (truncated.length === 0) {
      break;
    }
    relevantContent.push({ ...chunk, content: truncated });
    remaining -= truncated.length;
  }

  return {
    ...prompt,
    injected_context: {
      structure_summary: structureSummary,
      relevant_content: relevantContent,
      style_guidance: styleGuidance,
      preference_hints: preferenceHints,
    },
  };
}

/**
 * Apply data access policy to raw content chunks.
 */
export function applyDataAccessPolicyToChunks(
  chunks: ContentChunk[],
  policy: DataAccessPolicy
): ContentChunk[] {
  const maxChars = Math.max(0, policy.max_context_chars);
  let remaining = maxChars;
  const filtered: ContentChunk[] = [];

  for (const chunk of chunks) {
    if (remaining <= 0) {
      break;
    }
    if (!isBlockAllowed(chunk.block_id, policy)) {
      continue;
    }
    const redacted = redactText(chunk.content, policy);
    if (redacted === null) {
      continue;
    }
    const truncated = truncateToLimit(redacted, remaining);
    if (truncated.length === 0) {
      break;
    }
    filtered.push({ ...chunk, content: truncated });
    remaining -= truncated.length;
  }

  return filtered;
}

// ============================================================================
// Context Manager Interface
// ============================================================================

/**
 * Manages AI document context.
 */
export interface ContextManager {
  /**
   * Get or create context for a document.
   */
  getContext(documentId: string): AIDocumentContext;

  /**
   * Update document structure.
   */
  updateStructure(documentId: string, outline: DocumentOutline): void;

  /**
   * Add an entity.
   */
  addEntity(documentId: string, entity: Entity): void;

  /**
   * Record an intent for memory.
   */
  recordIntent(documentId: string, intent: EditIntent): void;

  /**
   * Record a user preference.
   */
  recordPreference(documentId: string, preference: UserPreference): void;

  /**
   * Record a rejected suggestion.
   */
  recordRejection(documentId: string, rejection: RejectedSuggestion): void;

  /**
   * Update focus areas.
   */
  updateFocus(documentId: string, focus: Partial<FocusAreas>): void;

  /**
   * Build context-aware prompt.
   */
  buildPrompt(documentId: string, basePrompt: string, budget: TokenBudget): ContextAwarePrompt;

  /**
   * Clear context for a document.
   */
  clearContext(documentId: string): void;
}

// ============================================================================
// Context Manager Implementation
// ============================================================================

/**
 * In-memory context manager.
 */
export class InMemoryContextManager implements ContextManager {
  private contexts = new Map<string, AIDocumentContext>();

  getContext(documentId: string): AIDocumentContext {
    let context = this.contexts.get(documentId);
    if (!context) {
      context = this.createEmptyContext(documentId);
      this.contexts.set(documentId, context);
    }
    return context;
  }

  updateStructure(documentId: string, outline: DocumentOutline): void {
    const context = this.getContext(documentId);
    context.structure.outline = outline;
    context.version++;
    context.updated_at = Date.now();
  }

  addEntity(documentId: string, entity: Entity): void {
    const context = this.getContext(documentId);
    const existing = context.structure.key_entities.findIndex(
      (e) => e.text === entity.text && e.type === entity.type
    );
    if (existing >= 0) {
      context.structure.key_entities[existing] = entity;
    } else {
      context.structure.key_entities.push(entity);
    }
    context.version++;
    context.updated_at = Date.now();
  }

  recordIntent(documentId: string, intent: EditIntent): void {
    const context = this.getContext(documentId);
    context.memory.recent_intents.unshift(intent);
    if (context.memory.recent_intents.length > context.memory.max_items) {
      context.memory.recent_intents.pop();
    }
    context.version++;
    context.updated_at = Date.now();
  }

  recordPreference(documentId: string, preference: UserPreference): void {
    const context = this.getContext(documentId);
    const existing = context.memory.user_preferences.findIndex((p) => p.key === preference.key);
    if (existing >= 0) {
      context.memory.user_preferences[existing] = preference;
    } else {
      context.memory.user_preferences.push(preference);
    }
    context.version++;
    context.updated_at = Date.now();
  }

  recordRejection(documentId: string, rejection: RejectedSuggestion): void {
    const context = this.getContext(documentId);
    context.memory.rejected_suggestions.unshift(rejection);
    if (context.memory.rejected_suggestions.length > context.memory.max_items) {
      context.memory.rejected_suggestions.pop();
    }
    context.version++;
    context.updated_at = Date.now();
  }

  updateFocus(documentId: string, focus: Partial<FocusAreas>): void {
    const context = this.getContext(documentId);
    Object.assign(context.focus, focus, { updated_at: Date.now() });
    context.version++;
    context.updated_at = Date.now();
  }

  buildPrompt(documentId: string, basePrompt: string, budget: TokenBudget): ContextAwarePrompt {
    const context = this.getContext(documentId);

    // Build structure summary
    const structureSummary = this.buildStructureSummary(context);

    // Build style guidance
    const styleGuidance = this.buildStyleGuidance(context.style);

    // Build preference hints
    const preferenceHints = context.memory.user_preferences
      .filter((p) => p.confidence > 0.7)
      .map((p) => `${p.key}: ${p.value}`);

    return {
      base_prompt: basePrompt,
      injected_context: {
        structure_summary: structureSummary,
        relevant_content: [],
        style_guidance: styleGuidance,
        preference_hints: preferenceHints,
      },
      token_budget: budget,
    };
  }

  clearContext(documentId: string): void {
    this.contexts.delete(documentId);
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private createEmptyContext(documentId: string): AIDocumentContext {
    return {
      document_id: documentId,
      structure: {
        outline: { entries: [], total_headings: 0, max_depth: 0 },
        key_entities: [],
        relationships: [],
      },
      style: {
        tone: "neutral",
        avg_sentence_length: 0,
        vocabulary_level: "moderate",
        detected_patterns: [],
      },
      memory: {
        recent_intents: [],
        user_preferences: [],
        rejected_suggestions: [],
        max_items: 50,
      },
      focus: {
        attention_blocks: [],
        related_blocks: [],
        updated_at: Date.now(),
      },
      version: 1,
      updated_at: Date.now(),
    };
  }

  private buildStructureSummary(context: AIDocumentContext): string {
    const { outline, key_entities } = context.structure;

    const parts: string[] = [];

    if (outline.entries.length > 0) {
      parts.push(`Document has ${outline.total_headings} sections.`);
    }

    if (key_entities.length > 0) {
      const topEntities = key_entities
        .sort((a, b) => b.salience - a.salience)
        .slice(0, 5)
        .map((e) => e.text);
      parts.push(`Key topics: ${topEntities.join(", ")}.`);
    }

    return parts.join(" ");
  }

  private buildStyleGuidance(style: StyleFingerprint): string {
    const parts: string[] = [];

    parts.push(`Tone: ${style.tone}.`);
    parts.push(`Vocabulary: ${style.vocabulary_level}.`);

    if (style.avg_sentence_length > 0) {
      parts.push(`Avg sentence: ${Math.round(style.avg_sentence_length)} words.`);
    }

    return parts.join(" ");
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a context manager.
 */
export function createContextManager(): ContextManager {
  return new InMemoryContextManager();
}
