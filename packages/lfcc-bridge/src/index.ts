// Re-export LoroDoc for consumers who need to create empty docs
export { LoroDoc } from "loro-crdt";

export * from "./adapters/editorAdapterPM";
export * from "./anchors/loroAnchors";
export * from "./annotations/annotationRepo";
export * from "./annotations/annotationSchema";
export * from "./annotations/annotationUiAdapter";
export * from "./annotations/verificationSync";
export * from "./annotations/securityIntegration";
export * from "./apply/applyPmTransaction";
export * from "./bridge/bridgeController";
export * from "./bridge/opOrdering";
export * from "./crdt/crdtSchema";
export * from "./dirty/dirtyInfo";
export * from "./dirty/assertDirtyInfo";
export * from "./integrity/divergence";
export * from "./pm/canonicalToPm";
export * from "./pm/pmSchema";
export * from "./pm/validateBlockIds";
export * from "./policy/degradationManager";
export * from "./policy/degradationStateMachine";
export * from "./policy/policyDegradation";
export * from "./policy/policyManager";
export * from "./projection/projection";
export * from "./runtime/loroRuntime";
export * from "./security/aiGatewayWrite";
export * from "./security/relocation";
export * from "./security/validator";
export * from "./selection/selectionMapping";
export * from "./sync/syncAdapter";
export * from "./sync/collabAdapter";
export * from "./sync/collabEncoding";
export * from "./sync/collabManager";
export * from "./sync/collabMessages";
export * from "./sync/webSocketCollabAdapter";
export * from "./undo/undoIntegration";
export * from "./utils/unicode";
export * from "./streaming";
// DocumentFacade - Single authority document access layer (preferred)
export * from "./facade";
// Canonical document model (deprecated, removed in favor of Facade)
// Use DocumentFacade for all document operations
