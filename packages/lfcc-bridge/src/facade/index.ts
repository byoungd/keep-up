/**
 * LFCC DocumentFacade Module
 *
 * Single-authority document access layer.
 */

// Implementation
export { createDocumentFacade, LoroDocumentFacade } from "./documentFacade";
// AI Gateway Integration
export {
  buildSelectionAnnotationId,
  buildSelectionSpanId,
  createLoroAIGateway,
  createLoroDocumentProvider,
  createLoroGatewayRetryProviders,
} from "./loroDocumentProvider";
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
