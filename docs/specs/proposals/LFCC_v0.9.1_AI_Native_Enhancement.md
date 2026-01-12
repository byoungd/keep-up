# LFCC v0.9.1 - AI-Native Enhancement Proposal

**Status:** Draft Proposal (Extension-only)
**Author:** Keep-Up Team
**Created:** 2026-01-11
**Target Version:** LFCC v0.9.1 (Optional Extension)
**Goal:** Evolve LFCC from "AI-Compatible" to "AI-Native", positioning it as the foundational infrastructure for AI-assisted document editing.

---

## Integration Decision (2026-01-12)

This proposal is not merged into the LFCC v0.9 core spec. The agreed path is to ship it as an optional v0.9.1 extension, negotiated via capabilities and policy. The authoritative requirements live in `docs/specs/engineering/23_AI_Native_Extension.md`.

## Executive Summary

LFCC v0.9 treats AI as an "external writer" — a controlled entity that submits document modifications through a Gateway interface. While this design ensures safety, it fails to unlock the full potential of AI in collaborative editing.

Decision: this proposal remains a negotiated extension for v0.9.1. Core LFCC v0.9 RC remains unchanged, and the extension requirements are captured in `docs/specs/engineering/23_AI_Native_Extension.md`.

This proposal upgrades LFCC to be AI-Native by introducing:

1. **AI Operation Primitives** — Dedicated OpCodes with rich semantics
2. **Intent Tracking System** — Explainable edit chains with full traceability
3. **Multi-Agent Collaboration Protocol** — Native support for AI team coordination
4. **Content Provenance** — Complete audit trail for AI-generated content
5. **Semantic Conflict Resolution** — AI-assisted intelligent merge strategies
6. **Deterministic AI Envelope & Governance** — Explicit deltas, policy gating, and auditability

---

## Part 1: Current State Analysis

### 1.1 Existing AI Capabilities (v0.9)

```
┌─────────────────────────────────────────────────────────────┐
│                    LFCC v0.9 AI Architecture                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐     ┌─────────────┐     ┌─────────────────┐   │
│  │   AI    │────▶│  AI Gateway │────▶│ Dry-Run Pipeline│   │
│  │ (LLM)   │     │  (Envelope) │     │ Sanitize→Norm→  │   │
│  └─────────┘     └─────────────┘     │ SchemaApply     │   │
│       │                │             └────────┬────────┘   │
│       │                │                      │            │
│       ▼                ▼                      ▼            │
│  ┌─────────┐     ┌─────────────┐     ┌─────────────────┐   │
│  │Targeting│     │Preconditions│     │   CRDT Engine   │   │
│  │(IDs only)│    │(context_hash)│    │     (Loro)     │   │
│  └─────────┘     └─────────────┘     └─────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Current Capabilities:**

| Capability | Status | Assessment |
|------------|--------|------------|
| Stable ID Targeting | ✅ Complete | Secure but inflexible |
| Dry-Run Validation | ✅ Complete | Validation only, no semantic understanding |
| 409 Conflict Handling | ✅ Complete | Mechanical retry logic |
| Content Whitelist | ✅ Complete | Static rules |
| Relocation Strategy | ⚠️ Basic | Only 3 levels, no intelligent matching |

### 1.2 Core Limitations

#### L1: AI as "External Writer"

```typescript
// Current: AI submits mere "content replacement"
type AIRequest = {
  doc_frontier: string;
  ops_xml: string;  // No structured intent
  preconditions: SpanPrecondition[];
};
```

The AI's editing intent (e.g., "improve phrasing", "fix grammar", "expand argument") is completely lost.

#### L2: No Operation-Level Tracking

Current OpCode taxonomy excludes AI operations:

```typescript
// v0.9 OpCodes - All human-editing oriented
type OpCode =
  | "OP_TEXT_EDIT"
  | "OP_MARK_EDIT"
  | "OP_BLOCK_SPLIT"
  | "OP_BLOCK_JOIN"
  // ... No AI-specific operations
```

#### L3: Single-Agent Model

Current architecture assumes a single AI interacting through the Gateway, with no support for:
- Parallel multi-agent editing
- Inter-agent dependency coordination
- Agent role and permission separation

#### L4: No Generated Content Marking

AI-generated content is indistinguishable from human content at the CRDT layer, lacking:
- Origin traceability
- Confidence scoring
- Review status tracking

#### L5: Mechanical Conflict Resolution

Relocation strategies rely solely on text similarity without semantic understanding.

#### L6: No Deterministic AI Execution Model

AI edits depend on LLM output at runtime, but the protocol does not require explicit, replayable deltas. This weakens convergence guarantees and auditability.

#### L7: Missing Security and Governance Layer

There is no protocol-level authentication, authorization, or audit trail for AI agents. Agent identity is not verifiable and cannot be enforced consistently across replicas.

#### L8: Missing Data Access and Privacy Controls

The protocol does not define what document context an AI may read, how sensitive spans are redacted, or how prompt injection is mitigated.

---

## Part 2: AI-Native Enhancement Design

### 2.1 Design Principles

1. **AI Operations as First-Class Citizens** — AI edits receive dedicated semantics and tracking
2. **Intent Traceability** — Every AI modification carries complete context
3. **Multi-Agent Native** — Protocol-level support for agent collaboration
4. **Generation Provenance** — Full lifecycle auditability for AI content
5. **Backward Compatible** — Existing v0.9 implementations can upgrade smoothly
6. **Deterministic Replication** — AI metadata never affects convergence; only explicit deltas do
7. **Security and Privacy by Default** — Least privilege, policy gating, and auditability
8. **Model-Agnostic and Offline-Friendly** — No dependency on a specific LLM or availability

### 2.2 New Protocol Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                  LFCC v0.9.1 AI-Native Architecture             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Agent Coordination Layer                │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐      │  │
│  │  │ Agent A │  │ Agent B │  │ Agent C │  │  Human  │      │  │
│  │  │(Writer) │  │(Reviewer)│ │(Refiner)│  │ (User)  │      │  │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘      │  │
│  │       │            │            │            │            │  │
│  │       ▼            ▼            ▼            ▼            │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │              Intent Registry (NEW)                  │ │  │
│  │  │   [EditIntent] [ReviewIntent] [RefineIntent] ...    │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   AI Operation Layer (NEW)                │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │ AI OpCodes  │  │  Provenance │  │ Semantic Merge  │   │  │
│  │  │ (OP_AI_*)   │  │   Tracker   │  │    Engine       │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  │                                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Existing LFCC Core (Enhanced)                │  │
│  │                                                           │  │
│  │  ┌─────────┐  ┌─────────────┐  ┌───────────────────────┐ │  │
│  │  │  CRDT   │  │   Bridge    │  │    Canonicalizer      │ │  │
│  │  │ Engine  │  │  (Mode A/B) │  │   (v2 + AI Markers)   │ │  │
│  │  └─────────┘  └─────────────┘  └───────────────────────┘ │  │
│  │                                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Deterministic AI Execution Model

LFCC remains deterministic by treating AI as a planning layer only. All AI outputs are captured as explicit LFCC operations that replicas can replay without invoking any model.

- AI metadata MUST NOT influence state convergence.
- AI decisions are recorded as payloads (canonical deltas or ops XML).
- Retries MUST be idempotent via request identifiers.

**Normative Requirements:**

**DET-001:** AI-generated changes MUST be expressed as explicit LFCC operations.
**DET-002:** Replicas MUST be able to apply all AI operations without calling an LLM.
**DET-003:** AI metadata MUST NOT change canonical document state.

### 2.4 Security, Privacy, and Governance Baseline

AI-native collaboration requires protocol-level controls for identity, permissions, and data exposure.

- Agent identity MUST be bound to an authenticated session.
- Policies MUST define what content can be read, not only what can be written.
- Audit records MUST be append-only and tamper-evident.

**Normative Requirements:**

**SEC-001:** All AI requests MUST be authenticated and authorized by policy.
**SEC-002:** AI read-access MUST respect redaction and context window limits.
**SEC-003:** Audit logs MUST be retained per negotiated policy.

---

## Part 3: Detailed Specifications

### 3.1 AI Operation Primitives (AI OpCodes)

Extension to §4 Operation Taxonomy:

```typescript
// NEW: AI-Specific Operation Codes
type AIOpCode =
  // Content Generation
  | "OP_AI_GENERATE"      // Generate new content
  | "OP_AI_EXPAND"        // Expand existing content
  | "OP_AI_SUMMARIZE"     // Summarize/compress content

  // Content Modification
  | "OP_AI_REWRITE"       // Rewrite/rephrase
  | "OP_AI_TRANSLATE"     // Translate content
  | "OP_AI_REFINE"        // Polish/optimize
  | "OP_AI_CORRECT"       // Fix errors (grammar/spelling)

  // Structural Operations
  | "OP_AI_RESTRUCTURE"   // Reorganize structure
  | "OP_AI_FORMAT"        // Format content
  | "OP_AI_SPLIT_MERGE"   // Intelligent split/merge

  // Review Operations
  | "OP_AI_REVIEW"        // Review/comment
  | "OP_AI_SUGGEST"       // Suggestion (accept/reject)
  | "OP_AI_VALIDATE"      // Validate/confirm

  // Collaboration Operations
  | "OP_AI_HANDOFF"       // Inter-agent handoff
  | "OP_AI_DELEGATE"      // Delegate subtask
  | "OP_AI_MERGE_RESOLVE" // Intelligent conflict resolution

// Operation Metadata
interface AIOperationMeta {
  op_code: AIOpCode;
  agent_id: string;
  intent_id?: string;          // Reference to EditIntent in registry
  intent?: EditIntent;          // Optional inline intent payload

  // Provenance
  provenance: {
    model_id: string;           // e.g., "claude-3-opus"
    model_version?: string;
    prompt_hash?: string;       // Prompt hash (not storing original)
    prompt_template_id?: string;
    temperature?: number;
    input_context_hashes?: string[];
    rationale_summary?: string; // Short rationale, no chain-of-thought
  };

  // Confidence
  confidence: {
    score: number;              // 0-1
    calibration_source?: string;
  };

  // Dependencies
  depends_on?: string[];        // IDs of prior operations this depends on
  supersedes?: string[];        // IDs of prior operations this replaces
}

// AIOperation is a standard LFCC operation with AI metadata attached.
// The underlying operation payload remains deterministic and replayable.
type AIOperation = Operation & {
  meta: AIOperationMeta;
};
```

**Normative Requirements:**

**AI-OP-001:** AI operations MUST carry valid `AIOperationMeta`.
**AI-OP-002:** `agent_id` MUST uniquely identify the Agent instance within the session.
**AI-OP-003:** `provenance.model_id` MUST use standardized model identifiers.
**AI-OP-004:** AI operations MUST reference an `EditIntent` via `intent_id` or inline `intent`.
**AI-OP-005:** `provenance.prompt_hash` SHOULD be provided when prompts are generated.

### 3.2 Edit Intent System

```typescript
// Intent Category Hierarchy
type EditIntentCategory =
  | "content_creation"    // Creating new content
  | "content_modification"// Modifying existing content
  | "structure_change"    // Structural adjustments
  | "quality_improvement" // Quality enhancement
  | "review_feedback"     // Review and feedback
  | "collaboration"       // Collaboration-related

interface EditIntent {
  id: string;
  category: EditIntentCategory;

  // Human-Readable Description
  description: {
    short: string;          // e.g., "Improve paragraph clarity"
    detailed?: string;      // Detailed explanation
    locale: string;         // "en-US", "zh-CN"
  };

  // Structured Intent
  structured: {
    action: string;         // "rewrite", "expand", "fix_grammar"
    target_aspect?: string; // "clarity", "tone", "accuracy"
    constraints?: Record<string, unknown>;
  };

  // User Request Context (Optional)
  user_context?: {
    original_request?: string;    // Original user request
    conversation_id?: string;     // Conversation context
  };

  // Intent Chain (Multi-Step Editing)
  chain?: {
    parent_intent_id?: string;
    step_index?: number;
    total_steps?: number;
  };
}
```

**Intent Registry:**

```typescript
interface IntentRegistry {
  // Register intent
  registerIntent(intent: EditIntent): string;

  // Query intent chain
  getIntentChain(intentId: string): EditIntent[];

  // Query by agent
  getIntentsByAgent(agentId: string): EditIntent[];

  // Query by time range
  getIntentsInRange(start: number, end: number): EditIntent[];
}
```

**Normative Requirements:**

**INTENT-001:** Every AI operation MUST be associated with an `EditIntent`.
**INTENT-002:** Intent description MUST provide at least the `short` field.
**INTENT-003:** Multi-step edits MUST use the `chain` field to establish relationships.

### 3.3 Content Provenance Tracking

Extension to §3 Core Data Model:

```typescript
// Extended Block Structure
interface BlockV3 {
  block_id: string;
  type: string;
  range: { start_anchor: string; end_anchor: string };
  attrs: Record<string, unknown>;
  parent: { block_id: string | null; path: string | null };

  // NEW: AI Provenance Information
  ai_provenance?: AIBlockProvenance;

  v: 3;  // Version upgrade
}

interface AIBlockProvenance {
  // Generation Origin
  origin: "human" | "ai" | "ai_assisted" | "mixed";

  // Detailed AI Generation Information
  ai_generations?: AIGenerationRecord[];

  // Review Status
  review_status?: "pending" | "approved" | "rejected" | "modified";
  reviewed_by?: string;
  reviewed_at?: number;
}

interface AIGenerationRecord {
  generation_id: string;
  timestamp: number;

  // Who generated it
  agent: {
    agent_id: string;
    agent_type: string;    // "writer", "translator", "editor"
    model_id: string;
  };

  // Operation Information
  operation: {
    op_code: AIOpCode;
    intent_id: string;
  };

  // Content Range (relative to current block)
  affected_range?: {
    start: number;
    end: number;
  };

  // Confidence and Quality Signals
  quality_signals?: {
    confidence: number;
    factuality_check?: "passed" | "failed" | "uncertain";
    style_match?: number;
  };
}
```

**Inline Provenance (Fine-Grained Tracking):**

Extension to the Mark system:

```typescript
// New AI Provenance Mark
type AIProvenanceMark = {
  type: "ai_generated";
  attrs: {
    generation_id: string;
    agent_id: string;
    confidence: number;
    review_status: "pending" | "approved" | "rejected";
  };
};

// Canonicalizer Extension
type CanonMarkV2 =
  | CanonMark                    // Existing marks
  | "ai_generated"               // NEW: AI generated marker
  | "ai_suggested"               // NEW: AI suggestion (pending confirmation)
  | "ai_reviewed";               // NEW: AI reviewed marker
```

**Normative Requirements:**

**PROV-001:** AI-generated content MUST carry `ai_provenance` information.
**PROV-002:** Provenance information MUST remain consistent across CRDT synchronization.
**PROV-003:** When humans edit AI-generated content, `origin` MUST update to `"mixed"`.

### 3.4 Multi-Agent Collaboration Protocol

```typescript
// Agent Identity and Capabilities
interface AgentIdentity {
  agent_id: string;
  agent_type: AgentType;

  // Capability Declaration
  capabilities: AgentCapability[];

  // Permission Scope
  permissions: AgentPermissions;

  // Metadata
  metadata: {
    display_name: string;
    model_id?: string;
    created_at: number;
    session_id: string;
  };
}

type AgentType =
  | "writer"      // Content creation
  | "editor"      // Editing and polishing
  | "reviewer"    // Review and proofreading
  | "translator"  // Translation
  | "researcher"  // Research/lookup
  | "formatter"   // Formatting
  | "orchestrator"// Coordinator (manages other agents)
  | "custom";

type AgentCapability =
  | "generate_content"
  | "modify_content"
  | "delete_content"
  | "add_annotations"
  | "modify_annotations"
  | "restructure_document"
  | "approve_suggestions"
  | "delegate_tasks"
  | "resolve_conflicts";

interface AgentPermissions {
  // Operable document regions
  scope: "full_document" | "assigned_blocks" | "annotations_only";
  assigned_blocks?: string[];

  // Operation type restrictions
  allowed_ops: AIOpCode[];

  // Whether human approval is required
  requires_human_approval: boolean;

  // Concurrency control
  max_concurrent_edits: number;
}
```

**Agent Coordination Protocol:**

```typescript
interface AgentCoordinationProtocol {
  // Lifecycle
  registerAgent(identity: AgentIdentity): Promise<AgentSession>;
  deregisterAgent(agentId: string): Promise<void>;

  // Task Assignment
  claimBlocks(agentId: string, blockIds: string[]): Promise<ClaimResult>;
  releaseBlocks(agentId: string, blockIds: string[]): Promise<void>;

  // Dependency Management
  declareDependency(
    agentId: string,
    dependency: TaskDependency
  ): Promise<void>;

  waitForDependency(dependencyId: string): Promise<DependencyResult>;

  // Handoff
  handoff(
    fromAgentId: string,
    toAgentId: string,
    context: HandoffContext
  ): Promise<void>;

  // Conflict Detection
  checkConflicts(agentId: string, proposedOps: AIOperation[]): ConflictCheck;
}

interface ClaimResult {
  granted: string[];
  denied: Array<{ blockId: string; reason: string; holder?: string }>;
}

interface TaskDependency {
  dependency_id: string;
  type: "sequential" | "barrier" | "soft";
  depends_on: string[];      // Agent IDs or Task IDs
  timeout_ms?: number;
}

interface HandoffContext {
  intent: EditIntent;
  completed_work: string;    // Summary
  pending_tasks: string[];
  context_data?: Record<string, unknown>;
}
```

**Normative Requirements:**

**AGENT-001:** Multi-agent scenarios MUST use the Agent Coordination Protocol.
**AGENT-002:** Block editing rights MUST be acquired via `claimBlocks` before modification.
**AGENT-003:** Inter-agent handoffs MUST use `handoff` with complete context transfer.

### 3.5 Semantic Conflict Resolution (Semantic Merge)

Extension to §5 Relocation and conflict handling:

```typescript
// Conflict Types
type ConflictType =
  | "concurrent_edit"      // Concurrent edits to same region
  | "structural_conflict"  // Structural conflicts (e.g., split vs merge)
  | "semantic_conflict"    // Semantic conflicts (contradictory intents)
  | "dependency_conflict"; // Dependency conflicts (task ordering issues)

interface SemanticConflict {
  conflict_id: string;
  type: ConflictType;

  // Conflicting Parties
  parties: ConflictParty[];

  // Affected Region
  affected_blocks: string[];
  affected_range?: { start: number; end: number };

  // Semantic Analysis
  semantic_analysis?: {
    intent_compatibility: "compatible" | "neutral" | "conflicting";
    resolution_suggestion?: ResolutionStrategy;
    confidence: number;
  };
}

interface ConflictParty {
  source: "human" | "agent";
  agent_id?: string;
  operation: AIOperation | UserOperation;
  intent?: EditIntent;
  timestamp: number;
}

// Resolution Strategies
type ResolutionStrategy =
  | { type: "accept_left"; reason: string }
  | { type: "accept_right"; reason: string }
  | { type: "merge_both"; merged_content: string; explanation: string }
  | { type: "require_human"; reason: string }
  | { type: "defer"; until: string };

// Semantic Merge Engine Interface
interface SemanticMergeEngine {
  // Analyze conflict
  analyzeConflict(conflict: SemanticConflict): Promise<ConflictAnalysis>;

  // Suggest resolution
  suggestResolution(
    conflict: SemanticConflict,
    preferences?: MergePreferences
  ): Promise<ResolutionStrategy[]>;

  // Execute merge
  executeMerge(
    conflict: SemanticConflict,
    strategy: ResolutionStrategy
  ): Promise<MergeResult>;

  // Validate merge result
  validateMerge(result: MergeResult): Promise<ValidationResult>;
}

interface MergePreferences {
  // Priority settings
  priority: "prefer_human" | "prefer_ai" | "prefer_recent" | "prefer_intent_match";

  // AI behavior
  ai_autonomy: "full" | "suggest_only" | "disabled";

  // Quality threshold
  confidence_threshold: number;
}

interface ConflictAnalysis {
  // Compatibility assessment
  compatibility: {
    can_auto_merge: boolean;
    merge_complexity: "trivial" | "simple" | "complex" | "impossible";
  };

  // Intent analysis
  intent_analysis: {
    intents_aligned: boolean;
    combined_intent?: EditIntent;
  };

  // Risk assessment
  risk_assessment: {
    data_loss_risk: "none" | "low" | "medium" | "high";
    semantic_drift_risk: "none" | "low" | "medium" | "high";
  };
}
```

**Normative Requirements:**

**MERGE-001:** Semantic conflict detection MUST consider `EditIntent` compatibility.
**MERGE-002:** Automatic merge MUST only execute when `confidence >= confidence_threshold`.
**MERGE-003:** Unresolvable conflicts MUST request human decision.
**MERGE-004:** Any AI-proposed merge MUST be persisted as explicit LFCC operations.

### 3.6 AI Transaction Support (Multi-Step Transactions)

```typescript
// AI Transaction Definition
interface AITransaction {
  txn_id: string;
  agent_id: string;

  // Transaction Intent
  intent: EditIntent;

  // Operation Sequence
  operations: AIOperation[];

  // Transaction Constraints
  constraints: TransactionConstraints;

  // State
  state: TransactionState;
}

interface TransactionConstraints {
  // Atomicity level
  atomicity: "all_or_nothing" | "best_effort" | "partial_allowed";

  // Isolation level
  isolation: "serializable" | "snapshot" | "read_committed";

  // Timeout
  timeout_ms: number;

  // Rollback strategy
  rollback_strategy: "full" | "partial" | "compensate";
}

type TransactionState =
  | { phase: "preparing"; prepared_ops: number }
  | { phase: "executing"; completed_ops: number; total_ops: number }
  | { phase: "committed"; result: TransactionResult }
  | { phase: "rolled_back"; reason: string }
  | { phase: "failed"; error: TransactionError };

interface TransactionResult {
  success: boolean;
  applied_operations: string[];  // Operation IDs
  affected_blocks: string[];
  rollback_available: boolean;
  rollback_deadline?: number;
}

// Transaction Manager
interface AITransactionManager {
  // Begin transaction
  begin(
    agentId: string,
    intent: EditIntent,
    constraints?: TransactionConstraints
  ): Promise<AITransaction>;

  // Add operation
  addOperation(txnId: string, op: AIOperation): Promise<void>;

  // Pre-validate
  validate(txnId: string): Promise<ValidationResult>;

  // Commit
  commit(txnId: string): Promise<TransactionResult>;

  // Rollback
  rollback(txnId: string, reason: string): Promise<void>;

  // Query state
  getState(txnId: string): TransactionState;
}
```

**Normative Requirements:**

**TXN-001:** Multi-step AI edits SHOULD be wrapped in transactions.
**TXN-002:** On transaction failure, the system MUST handle according to `rollback_strategy`.
**TXN-003:** Transaction timeout MUST trigger automatic rollback.

### 3.7 AI Gateway Request Envelope

AI-native LFCC defines a standard envelope for AI requests. The gateway performs validation, runs the dry-run pipeline, and emits deterministic LFCC operations.

```typescript
type AIGatewayRequest = {
  request_id: string;          // Idempotency key
  client_request_id?: string;  // Legacy client id (deprecated)
  agent_id: string;
  doc_frontier: string;
  intent_id?: string;
  intent?: EditIntent;
  preconditions: SpanPrecondition[];
  ops_xml: string;             // Canonicalized operation payload
  policy_context?: {
    policy_id?: string;
    redaction_profile?: string;
  };
};

type AIGatewayResponse = {
  status: "accepted" | "rejected" | "conflict";
  applied_ops?: string[];
  new_frontier?: string;
  dry_run_report?: {
    stage: "sanitize" | "normalize" | "schema_apply";
    ok: boolean;
    reason?: string;
  };
  error?: {
    code:
      | "AI_INVALID"
      | "AI_POLICY_DENIED"
      | "AI_CONFLICT"
      | "AI_PRECONDITION_FAILED"
      | "AI_SCHEMA_FAILED"
      | "AI_RATE_LIMIT"
      | "AI_UNAVAILABLE";
    message: string;
  };
};
```

**Normative Requirements:**

**GW-001:** Requests MUST include `request_id`, `doc_frontier`, `intent_id` or `intent`, and `preconditions`.
**GW-002:** Gateways MUST enforce idempotency for `request_id` within a policy-defined window.
**GW-003:** Stale `doc_frontier` MUST result in `AI_CONFLICT` with no mutation.
**GW-004:** Gateways MUST NOT return raw prompts or chain-of-thought content.

### 3.8 Security, Privacy, and Governance Controls

AI-native LFCC requires explicit security controls for agent identity and data exposure.

```typescript
interface DataAccessPolicy {
  max_context_chars: number;
  allow_blocks?: string[];
  deny_blocks?: string[];
  redaction_strategy: "mask" | "omit";
  pii_handling: "block" | "mask" | "allow";
}

interface AgentSession {
  agent_id: string;
  session_id: string;
  issued_at: number;
  expires_at: number;
  signature?: string;
}
```

**Normative Requirements:**

**SEC-004:** Agent identity MUST be bound to an authenticated session token.
**SEC-005:** Data access MUST be filtered by `DataAccessPolicy` before AI read.
**SEC-006:** All AI requests and responses MUST be auditable with tamper-evident logs.

---

## Part 4: Policy Manifest Extension

### 4.1 New Policy Fields

When negotiated, `ai_native_policy` is available at the top level for v0.9.1 peers. For mixed peers or v0.9 clients, place the same payload under `extensions.ai_native` to avoid unknown top-level field rejection.

```json
{
  "lfcc_version": "0.9.1",

  "ai_native_policy": {
    "version": "v1",

    "gateway": {
      "max_ops_per_request": 50,
      "max_payload_bytes": 200000,
      "idempotency_window_ms": 60000
    },

    "security": {
      "require_signed_requests": true,
      "agent_token_ttl_ms": 3600000,
      "audit_retention_days": 180,
      "allow_external_models": false
    },

    "data_access": {
      "max_context_chars": 8000,
      "redaction_strategy": "mask",
      "pii_handling": "block",
      "allow_external_fetch": false
    },

    "determinism": {
      "require_explicit_ops": true
    },

    "intent_tracking": {
      "enabled": true,
      "require_intent": true,
      "intent_retention_days": 90
    },

    "provenance": {
      "enabled": true,
      "track_inline": true,
      "require_model_id": true
    },

    "semantic_merge": {
      "enabled": true,
      "ai_autonomy": "suggest_only",
      "auto_merge_threshold": 0.85
    },

    "transactions": {
      "enabled": true,
      "default_timeout_ms": 60000,
      "max_operations_per_txn": 100
    },

    "ai_opcodes": {
      "allowed": [
        "OP_AI_GENERATE",
        "OP_AI_REWRITE",
        "OP_AI_CORRECT",
        "OP_AI_EXPAND",
        "OP_AI_SUMMARIZE",
        "OP_AI_TRANSLATE",
        "OP_AI_REFINE",
        "OP_AI_REVIEW",
        "OP_AI_SUGGEST",
        "OP_AI_VALIDATE"
      ],
      "require_approval": [
        "OP_AI_RESTRUCTURE",
        "OP_AI_SPLIT_MERGE"
      ]
    }
  },

  "capabilities": {
    "cross_block_annotations": true,
    "bounded_gap": true,
    "tables": true,
    "reorder_blocks": true,
    "ai_replace_spans": true,

    "ai_gateway_v2": true,
    "ai_data_access": true,
    "ai_audit": true,
    "ai_native": true,
    "multi_agent": true,
    "ai_provenance": true,
    "semantic_merge": true,
    "ai_transactions": true
  }
}
```

### 4.2 Negotiation Rules Extension

**NEG-AI-001:** `ai_native_policy` negotiation uses intersection + min strategy:
- `max_ops_per_request = min(...)`
- `max_payload_bytes = min(...)`
- `idempotency_window_ms = min(...)`
- `max_context_chars = min(...)`
- `allow_blocks = intersection(...)` (if specified)
- `deny_blocks = union(...)` (if specified)
- `allowed` opcodes = intersection
- `require_*` = OR (required if any party requires)
- `allow_external_models` = AND (allowed only if all parties allow)
- `ai_autonomy` = most restrictive (`disabled` > `suggest_only` > `full`)

**NEG-AI-002:** If `ai_native` capability mismatches, degrade to v0.9 behavior.

---

## Part 5: Conformance Kit Extension

### 5.1 New Test Categories

```typescript
// lfcc-kernel/testing/ai-native/

// 1. AI OpCode Consistency Testing
export function testAIOpCodeDeterminism(
  ops: AIOperation[],
  replicas: number
): ConformanceResult;

// 2. Intent Tracking Integrity
export function testIntentChainIntegrity(
  chain: EditIntent[]
): ConformanceResult;

// 3. Provenance Cross-Replica Consistency
export function testProvenanceConsistency(
  blocks: BlockV3[],
  replicas: CRDT[]
): ConformanceResult;

// 4. Multi-Agent Coordination Correctness
export function testAgentCoordinationProtocol(
  scenario: MultiAgentScenario
): ConformanceResult;

// 5. Semantic Merge Determinism
export function testSemanticMergeDeterminism(
  conflict: SemanticConflict,
  replicas: number
): ConformanceResult;

// 6. Transaction ACID Properties
export function testTransactionACID(
  txn: AITransaction,
  failurePoint?: number
): ConformanceResult;

// 7. Gateway Envelope Validation
export function testGatewayEnvelopeValidation(
  request: AIGatewayRequest
): ConformanceResult;

// 8. Deterministic AI Replay
export function testDeterministicAIReplay(
  ops: AIOperation[],
  replicas: number
): ConformanceResult;

// 9. Data Access Redaction
export function testDataAccessRedaction(
  policy: DataAccessPolicy,
  input: string
): ConformanceResult;
```

### 5.2 Fuzzing Extension

```typescript
// AI-specific fuzz targets
export const aiFuzzTargets = {
  // Random AI operation sequences
  randomAIOpSequence: (seed: number, length: number) => AIOperation[],

  // Random conflict scenarios
  randomConflictScenario: (seed: number) => SemanticConflict,

  // Random multi-agent scenarios
  randomMultiAgentScenario: (seed: number, agentCount: number) => Scenario,

  // Edge case: Long intent chains
  longIntentChain: (length: number) => EditIntent[],

  // Edge case: High concurrency agents
  highConcurrencyAgents: (agentCount: number) => Scenario,
};
```

---

## Part 6: Migration Path

AI-native is an optional extension. If capability negotiation fails or a peer is v0.9-only, fall back to v0.9 behavior and store any AI-native fields under `extensions.ai_native`.

### 6.1 Version Compatibility Matrix

| Scenario | v0.9 Client ↔ v0.9.1 Server | v0.9.1 Client ↔ v0.9 Server |
|----------|-----------------------------|-----------------------------|
| Basic Editing | ✅ Fully Compatible | ✅ Fully Compatible |
| AI Gateway | ✅ Uses v0.9 behavior | ✅ Uses v0.9 behavior |
| Multi-Agent | ❌ Degrades to single agent | ❌ Degrades to single agent |
| Provenance | ⚠️ Ignored | ⚠️ Unavailable |
| Semantic Merge | ⚠️ Uses v0.9 Relocation | ⚠️ Uses v0.9 Relocation |

### 6.2 Upgrade Steps

1. **Phase 0: Gateway and Policy Baseline**
   - Implement `AIGatewayRequest` envelope with idempotency
   - Enforce `DataAccessPolicy` defaults at the Gateway
   - Negotiate `ai_native_policy` fields with peers

2. **Phase 1: Data Model Upgrade**
   - Block schema v2 → v3
   - Add `ai_provenance` field (optional)
   - Mark existing data as `origin: "human"`

3. **Phase 2: OpCode Extension**
   - Add AI OpCodes support
   - Map existing AI Gateway operations to new OpCodes

4. **Phase 3: Agent Coordination**
   - Deploy Agent Registry
   - Treat existing single AI as default Agent

5. **Phase 4: Semantic Merge**
   - Deploy Merge Engine
   - Initial configuration as `suggest_only`

---

## Part 7: Open Questions

### Q1: Provenance Storage Overhead

AI provenance information may significantly increase document size. Should we consider:
- Optional compression strategies?
- Tiered storage (hot/cold)?
- Automatic cleanup policies?

### Q2: Cross-Document Agent Identity

Should Agent identity persist across documents/sessions? This involves:
- Agent reputation systems
- Long-term preference learning
- Privacy considerations

### Q3: Intent Localization

How should `EditIntent.description` handle multiple languages?
- Server-side translation?
- Client-side internationalization?
- Prioritize structured intent?

### Q4: Deterministic LLM Calls

Semantic merge relies on LLM. How to ensure determinism?
- Fixed seed + temperature=0?
- Result caching?
- Fallback to rule engine?

### Q5: Data Access Boundaries

How should `DataAccessPolicy` evolve?
- Allow-list by block type vs. semantic classification?
- Redaction strategy trade-offs (mask vs omit)?

### Q6: Audit Log Integrity

Should audit logs be signed or chained (Merkle) to ensure tamper evidence across devices?

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| AI OpCode | Type identifier for AI operations |
| EditIntent | Structured object describing editing purpose and context |
| Provenance | Tracking information for content origin and generation history |
| Agent Coordination | Protocol and mechanisms for multi-AI agent collaboration |
| Semantic Merge | Intent-aware intelligent conflict resolution |
| AI Transaction | Atomic unit encapsulating multi-step AI operations |
| AI Gateway Envelope | Standard request/response contract for AI edits |
| Data Access Policy | Policy constraints on AI read scope and redaction |

---

## Appendix B: Reference Implementation Suggestions

### B.1 Intent Registry (Redis/In-Memory)

```typescript
class IntentRegistryImpl implements IntentRegistry {
  private store = new Map<string, EditIntent>();
  private agentIndex = new Map<string, Set<string>>();

  registerIntent(intent: EditIntent): string {
    const id = intent.id || generateUUID();
    this.store.set(id, { ...intent, id });

    if (intent.chain?.parent_intent_id) {
      // Index for chain queries
    }

    return id;
  }

  getIntentChain(intentId: string): EditIntent[] {
    const result: EditIntent[] = [];
    let current = this.store.get(intentId);

    while (current) {
      result.unshift(current);
      current = current.chain?.parent_intent_id
        ? this.store.get(current.chain.parent_intent_id)
        : undefined;
    }

    return result;
  }
}
```

### B.2 Semantic Merge Engine (LLM-backed)

```typescript
class SemanticMergeEngineImpl implements SemanticMergeEngine {
  constructor(
    private llm: LLMProvider,
    private fallbackRules: RuleEngine
  ) {}

  async suggestResolution(
    conflict: SemanticConflict,
    preferences?: MergePreferences
  ): Promise<ResolutionStrategy[]> {
    // 1. Try rule engine first
    const ruleResult = this.fallbackRules.evaluate(conflict);
    if (ruleResult.confidence > 0.9) {
      return [ruleResult.strategy];
    }

    // 2. Use LLM for analysis
    const llmResult = await this.llm.analyzeConflict(conflict);
    return llmResult.strategies;
  }

  async analyzeConflict(conflict: SemanticConflict): Promise<ConflictAnalysis> {
    // Analyze intent compatibility
    const intentsAligned = this.checkIntentAlignment(conflict.parties);

    return {
      compatibility: {
        can_auto_merge: intentsAligned,
        merge_complexity: this.assessComplexity(conflict),
      },
      intent_analysis: {
        intents_aligned: intentsAligned,
      },
      risk_assessment: {
        data_loss_risk: "low",
        semantic_drift_risk: intentsAligned ? "low" : "medium",
      },
    };
  }

  private checkIntentAlignment(parties: ConflictParty[]): boolean {
    // Compare intent categories and actions
    const intents = parties.map(p => p.intent).filter(Boolean);
    if (intents.length < 2) return true;

    return intents.every(i =>
      i?.category === intents[0]?.category
    );
  }
}
```

### B.3 Agent Coordinator

```typescript
class AgentCoordinatorImpl implements AgentCoordinationProtocol {
  private agents = new Map<string, AgentSession>();
  private blockClaims = new Map<string, string>(); // blockId -> agentId

  async claimBlocks(agentId: string, blockIds: string[]): Promise<ClaimResult> {
    const granted: string[] = [];
    const denied: Array<{ blockId: string; reason: string; holder?: string }> = [];

    for (const blockId of blockIds) {
      const holder = this.blockClaims.get(blockId);

      if (!holder) {
        this.blockClaims.set(blockId, agentId);
        granted.push(blockId);
      } else if (holder === agentId) {
        granted.push(blockId);
      } else {
        denied.push({
          blockId,
          reason: "already_claimed",
          holder,
        });
      }
    }

    return { granted, denied };
  }

  async handoff(
    fromAgentId: string,
    toAgentId: string,
    context: HandoffContext
  ): Promise<void> {
    // Transfer block claims
    for (const [blockId, holder] of this.blockClaims) {
      if (holder === fromAgentId) {
        this.blockClaims.set(blockId, toAgentId);
      }
    }

    // Notify receiving agent
    const toAgent = this.agents.get(toAgentId);
    if (toAgent) {
      await toAgent.onHandoff(context);
    }
  }
}
```

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-11 | Initial draft |
| 0.2 | 2026-01-15 | Add deterministic envelope, gateway policy, and security controls |
| 0.3 | 2026-01-16 | Marked as optional v0.9.1 extension; moved requirements to engineering addendum |
