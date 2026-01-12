/**
 * LFCC DocumentFacade Module
 *
 * Single-authority document access layer.
 */

// Types
export type {
  AddCommentIntent,
  AIContext,
  AIWriteMetadata,
  AnnotationNode,
  AppendStreamChunkIntent,
  ApplyPlan,
  BaseIntent,
  Comment,
  DeleteBlockIntent,
  DeleteCommentIntent,
  DocumentFacade,
  FacadeAnnotationSpan,
  FacadeChangeEvent,
  FacadeChangeMetadata,
  FacadeChangeType,
  FacadeSubscriber,
  InsertBlockIntent,
  InsertMessageIntent,
  MessageBlock,
  MessageRole,
  MessageStatus,
  MoveBlockIntent,
  ToolCallRecord,
  UpdateAttrsIntent,
  UpdateContentIntent,
  UpdateMessageIntent,
} from "./types";

export { FACADE_STRICT_MODE } from "./types";

// Implementation
export { LoroDocumentFacade, createDocumentFacade } from "./documentFacade";

// AI Gateway Integration
export { createLoroAIGateway, createLoroDocumentProvider } from "./loroDocumentProvider";
