/**
 * LFCC v0.9 RC - Ghost Collaborator Module
 * @see docs/product/reports/strategy/LFCC_AI_Killer_Features_Analysis.md
 *
 * Killer Feature #2: AI treated as a remote CRDT user with presence cursor.
 * Non-blocking, asynchronous AI editing with real-time conflict resolution.
 *
 * Linear-quality implementation with:
 * - Branded ID types for compile-time safety
 * - Immutable data structures
 * - Result types for explicit error handling
 * - Observability hooks
 */

import { createEditIntent } from "./intent.js";
import {
  type BlockId,
  blockId,
  type ConflictId,
  conflictId,
  Err,
  None,
  Ok,
  type OpId,
  type Option,
  opId,
  type PeerId,
  peerId,
  type Result,
  type SessionId,
  Some,
  sessionId,
  TIMING,
  type TraceId,
  traceId,
  withTiming,
} from "./primitives.js";
import type { AIRequestEnvelope, DocFrontier, SpanPrecondition } from "./types.js";

// ============================================
// Types (Immutable)
// ============================================

/** AI peer identity (immutable) */
export type AIGhostPeer = {
  readonly peerId: PeerId;
  readonly displayName: string;
  readonly avatar?: string;
  readonly model: string;
  /** Current task being performed */
  readonly currentTask?: string;
  /** Whether the ghost is currently active */
  readonly isActive: boolean;
  /** Timestamp of last activity */
  readonly lastActivityAt: number;
};

/** Ghost cursor position (immutable) */
export type GhostCursor = {
  readonly peerId: PeerId;
  readonly blockId: BlockId;
  readonly offset: number;
  /** Selection range if ghost is selecting */
  readonly selectionEnd?: {
    readonly blockId: BlockId;
    readonly offset: number;
  };
};

/** Streaming operation type */
export type StreamingOpType = "insert" | "delete" | "convert";

/** Ghost presence state (immutable) */
export type GhostPresence = {
  readonly peer: AIGhostPeer;
  readonly cursor: GhostCursor | null;
  /** Current operation being streamed */
  readonly streamingOp?: {
    readonly type: StreamingOpType;
    readonly targetBlockId: BlockId;
    readonly progress: number;
    readonly previewText?: string;
  };
};

/** Ghost operation type */
export type GhostOpType = "insert" | "delete" | "replace" | "convert" | "reorder";

/** Ghost operation for CRDT streaming (immutable) */
export type GhostOp = {
  readonly opId: OpId;
  readonly peerId: PeerId;
  readonly timestamp: number;
  readonly type: GhostOpType;
  readonly blockId: BlockId;
  /** For text operations */
  readonly offset?: number;
  readonly text?: string;
  /** For structural operations */
  readonly targetType?: string;
  readonly newIndex?: number;
};

/** Ghost session state (immutable) */
export type GhostSession = {
  readonly sessionId: SessionId;
  readonly peer: AIGhostPeer;
  /** Document frontier when session started */
  readonly startFrontier: DocFrontier;
  /** Operations applied in this session */
  readonly appliedOps: readonly GhostOp[];
  /** Current document frontier */
  readonly currentFrontier: DocFrontier;
  /** Whether session is paused due to conflict */
  readonly isPaused: boolean;
  readonly pauseReason?: string;
};

/** Conflict resolution strategy */
export type ConflictResolution = "merge" | "pause" | "recontextualize";

/** Conflict detection result (immutable) */
export type GhostConflict = {
  readonly conflictId: ConflictId;
  readonly ghostOp: GhostOp;
  readonly userOp: {
    readonly blockId: BlockId;
    readonly timestamp: number;
    readonly type: string;
  };
  readonly resolution: ConflictResolution;
};

/** Callbacks for ghost collaborator integration */
export type GhostCollaboratorCallbacks = {
  /** Called when ghost cursor moves */
  readonly onCursorMove: (cursor: GhostCursor) => void;
  /** Called when ghost starts streaming text */
  readonly onStreamStart: (blockId: BlockId, preview: string) => void;
  /** Called for each streamed character/chunk */
  readonly onStreamChunk: (blockId: BlockId, chunk: string, progress: number) => void;
  /** Called when streaming completes */
  readonly onStreamEnd: (blockId: BlockId) => void;
  /** Called when conflict is detected */
  readonly onConflict: (conflict: GhostConflict) => void;
  /** Called when ghost session pauses */
  readonly onPause: (reason: string) => void;
  /** Called when ghost session resumes */
  readonly onResume: () => void;
};

/** Error types for ghost operations */
export type GhostError =
  | { readonly code: "NO_ACTIVE_SESSION"; readonly message: string }
  | { readonly code: "SESSION_PAUSED"; readonly message: string }
  | {
      readonly code: "CONFLICT_DETECTED";
      readonly message: string;
      readonly conflict: GhostConflict;
    };

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new AI ghost peer.
 */
export function createGhostPeer(config: {
  readonly displayName?: string;
  readonly model?: string;
}): AIGhostPeer {
  return Object.freeze({
    peerId: peerId(`ai-ghost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    displayName: config.displayName ?? "AI Assistant",
    model: config.model ?? "claude-opus-4-5-20250514",
    isActive: false,
    lastActivityAt: Date.now(),
  });
}

/**
 * Create a new ghost session.
 */
export function createGhostSession(
  peer: AIGhostPeer,
  docFrontier: DocFrontier,
  task?: string
): GhostSession {
  return Object.freeze({
    sessionId: sessionId(`ghost-session-${Date.now()}`),
    peer: Object.freeze({
      ...peer,
      isActive: true,
      currentTask: task,
      lastActivityAt: Date.now(),
    }),
    startFrontier: docFrontier,
    appliedOps: Object.freeze([]),
    currentFrontier: docFrontier,
    isPaused: false,
  });
}

/**
 * Create a ghost presence for UI rendering.
 */
export function createGhostPresence(
  session: GhostSession,
  cursor: GhostCursor | null
): GhostPresence {
  return Object.freeze({
    peer: session.peer,
    cursor,
    streamingOp: undefined,
  });
}

// ============================================
// Ghost Collaborator Controller
// ============================================

/**
 * Ghost Collaborator Controller
 *
 * Manages AI as a CRDT peer, handling:
 * - Presence cursor display
 * - Asynchronous operation streaming
 * - Conflict detection and resolution
 */
export class GhostCollaborator {
  private _session: GhostSession | null = null;
  private readonly callbacks: Partial<GhostCollaboratorCallbacks>;
  private opCounter = 0;
  private readonly trace: TraceId;

  constructor(
    private readonly peer: AIGhostPeer,
    callbacks?: Partial<GhostCollaboratorCallbacks>
  ) {
    this.callbacks = callbacks ?? {};
    this.trace = traceId();
  }

  /** Get current trace ID for debugging */
  getTraceId(): TraceId {
    return this.trace;
  }

  /**
   * Start a ghost session for a task.
   */
  startSession(docFrontier: DocFrontier, task: string): GhostSession {
    return withTiming(
      "GhostCollaborator.startSession",
      () => {
        this._session = createGhostSession(this.peer, docFrontier, task);
        return this._session;
      },
      { task }
    );
  }

  /**
   * End the current ghost session.
   */
  endSession(): readonly GhostOp[] {
    if (!this._session) {
      return Object.freeze([]);
    }
    const ops = this._session.appliedOps;
    this._session = null;
    return ops;
  }

  /**
   * Get current session state (Option type for explicit handling).
   */
  getSession(): Option<GhostSession> {
    return this._session ? Some(this._session) : None;
  }

  /**
   * Check if session is active and not paused.
   */
  isReady(): boolean {
    return this._session !== null && !this._session.isPaused;
  }

  /**
   * Update ghost cursor position.
   */
  moveCursor(targetBlockId: BlockId, offset: number): Result<GhostCursor, GhostError> {
    if (!this._session) {
      return Err({ code: "NO_ACTIVE_SESSION", message: "No active ghost session" });
    }
    if (this._session.isPaused) {
      return Err({
        code: "SESSION_PAUSED",
        message: this._session.pauseReason ?? "Session is paused",
      });
    }

    const cursor: GhostCursor = Object.freeze({
      peerId: this.peer.peerId,
      blockId: targetBlockId,
      offset,
    });

    this._session = Object.freeze({
      ...this._session,
      peer: Object.freeze({
        ...this._session.peer,
        lastActivityAt: Date.now(),
      }),
    });

    this.callbacks.onCursorMove?.(cursor);
    return Ok(cursor);
  }

  /**
   * Start streaming text insertion at a position.
   */
  startStreaming(
    targetBlockId: BlockId,
    offset: number,
    preview?: string
  ): Result<void, GhostError> {
    const cursorResult = this.moveCursor(targetBlockId, offset);
    if (!cursorResult.ok) {
      return cursorResult;
    }

    this.callbacks.onStreamStart?.(targetBlockId, preview ?? "");
    return Ok(undefined);
  }

  /**
   * Stream a chunk of text (simulates AI typing).
   */
  streamChunk(
    targetBlockId: BlockId,
    chunk: string,
    progress: number,
    offset?: number
  ): Result<GhostOp, GhostError> {
    if (!this._session) {
      return Err({ code: "NO_ACTIVE_SESSION", message: "No active ghost session" });
    }
    if (this._session.isPaused) {
      return Err({
        code: "SESSION_PAUSED",
        message: this._session.pauseReason ?? "Session is paused",
      });
    }

    const op: GhostOp = Object.freeze({
      opId: opId(`ghost-op-${this.opCounter++}`),
      peerId: this.peer.peerId,
      timestamp: Date.now(),
      type: "insert",
      blockId: targetBlockId,
      offset,
      text: chunk,
    });

    // Immutable update to session
    this._session = Object.freeze({
      ...this._session,
      appliedOps: Object.freeze([...this._session.appliedOps, op]),
      peer: Object.freeze({
        ...this._session.peer,
        lastActivityAt: Date.now(),
      }),
    });

    this.callbacks.onStreamChunk?.(targetBlockId, chunk, progress);
    return Ok(op);
  }

  /**
   * End streaming for a block.
   */
  endStreaming(targetBlockId: BlockId): void {
    this.callbacks.onStreamEnd?.(targetBlockId);
  }

  /**
   * Detect conflict between ghost op and user op.
   */
  detectConflict(
    ghostOp: GhostOp,
    userOp: { readonly blockId: BlockId; readonly timestamp: number; readonly type: string }
  ): Option<GhostConflict> {
    // Different blocks - no conflict
    if (ghostOp.blockId !== userOp.blockId) {
      return None;
    }

    // Concurrent edits to same block within conflict window
    if (Math.abs(ghostOp.timestamp - userOp.timestamp) < TIMING.CONFLICT_WINDOW_MS) {
      const conflict: GhostConflict = Object.freeze({
        conflictId: conflictId(`conflict-${Date.now()}`),
        ghostOp,
        userOp,
        resolution: determineResolution(ghostOp, userOp),
      });

      this.callbacks.onConflict?.(conflict);
      return Some(conflict);
    }

    return None;
  }

  /**
   * Pause the ghost session due to conflict.
   */
  pause(reason: string): void {
    if (!this._session) {
      return;
    }

    this._session = Object.freeze({
      ...this._session,
      isPaused: true,
      pauseReason: reason,
    });

    this.callbacks.onPause?.(reason);
  }

  /**
   * Resume the ghost session after conflict resolution.
   */
  resume(): void {
    if (!this._session) {
      return;
    }

    this._session = Object.freeze({
      ...this._session,
      isPaused: false,
      pauseReason: undefined,
    });

    this.callbacks.onResume?.();
  }

  /**
   * Update the session frontier after server acknowledgement.
   */
  updateFrontier(frontier: DocFrontier): Result<GhostSession, GhostError> {
    if (!this._session) {
      return Err({ code: "NO_ACTIVE_SESSION", message: "No active ghost session" });
    }

    this._session = Object.freeze({
      ...this._session,
      currentFrontier: frontier,
    });

    return Ok(this._session);
  }

  /**
   * Generate AI request envelope for a batch of ghost ops.
   */
  createEnvelope(
    ops: readonly GhostOp[],
    preconditions?: readonly SpanPrecondition[]
  ): Result<AIRequestEnvelope, GhostError> {
    if (!this._session) {
      return Err({ code: "NO_ACTIVE_SESSION", message: "No active ghost session" });
    }

    const opsXml = ops.map(formatOpAsXml).join("\n");
    const agentId = String(this.peer.peerId);
    const intent = createEditIntent(
      "collaboration",
      this.peer.currentTask ?? "Ghost collaborator update",
      "ghost_edit",
      { agent_id: agentId }
    );

    return Ok({
      doc_frontier: this._session.currentFrontier,
      request_id: generateRequestId(),
      agent_id: agentId,
      ops_xml: `<ghost_ops peer="${this.peer.peerId}">\n${opsXml}\n</ghost_ops>`,
      preconditions: preconditions ? [...preconditions] : [],
      intent,
      client_request_id: this._session.sessionId,
    });
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Determine how to resolve a conflict.
 */
function determineResolution(
  ghostOp: GhostOp,
  userOp: { readonly type: string }
): ConflictResolution {
  // If user is doing structural changes, pause and recontextualize
  const structuralOps = ["convert", "reorder", "split", "join"];
  if (structuralOps.includes(userOp.type)) {
    return "recontextualize";
  }

  // If both are text edits, try to merge
  if (ghostOp.type === "insert" && userOp.type === "insert") {
    return "merge";
  }

  // Default: pause ghost and wait
  return "pause";
}

/**
 * Format a ghost operation as XML.
 */
function formatOpAsXml(op: GhostOp): string {
  switch (op.type) {
    case "insert":
      return `<op type="insert" block="${op.blockId}" offset="${op.offset ?? 0}">${escapeXml(op.text ?? "")}</op>`;
    case "delete":
      return `<op type="delete" block="${op.blockId}" offset="${op.offset ?? 0}" length="${op.text?.length ?? 0}"/>`;
    case "convert":
      return `<op type="convert" block="${op.blockId}" target="${op.targetType}"/>`;
    case "reorder":
      return `<op type="reorder" block="${op.blockId}" index="${op.newIndex}"/>`;
    case "replace":
      return `<op type="replace" block="${op.blockId}" offset="${op.offset ?? 0}">${escapeXml(op.text ?? "")}</op>`;
  }
}

/**
 * Escape XML special characters.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Create a GhostCursor from raw data with branded types.
 */
export function createGhostCursor(raw: {
  peerId: string;
  blockId: string;
  offset: number;
  selectionEnd?: { blockId: string; offset: number };
}): GhostCursor {
  return Object.freeze({
    peerId: peerId(raw.peerId),
    blockId: blockId(raw.blockId),
    offset: raw.offset,
    selectionEnd: raw.selectionEnd
      ? Object.freeze({
          blockId: blockId(raw.selectionEnd.blockId),
          offset: raw.selectionEnd.offset,
        })
      : undefined,
  });
}

/**
 * Create a GhostOp from raw data with branded types.
 */
export function createGhostOp(raw: {
  opId: string;
  peerId: string;
  timestamp: number;
  type: GhostOpType;
  blockId: string;
  offset?: number;
  text?: string;
  targetType?: string;
  newIndex?: number;
}): GhostOp {
  return Object.freeze({
    opId: opId(raw.opId),
    peerId: peerId(raw.peerId),
    timestamp: raw.timestamp,
    type: raw.type,
    blockId: blockId(raw.blockId),
    offset: raw.offset,
    text: raw.text,
    targetType: raw.targetType,
    newIndex: raw.newIndex,
  });
}
