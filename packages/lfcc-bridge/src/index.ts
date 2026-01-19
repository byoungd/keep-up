// Re-export LoroDoc for consumers who need to create empty docs
export { LoroDoc } from "loro-crdt";

export * from "./adapters/editorAdapterPM";
export * from "./anchors/loroAnchors";
export * from "./annotations/annotationRepo";
export * from "./annotations/annotationSchema";
export * from "./annotations/annotationUiAdapter";
export * from "./annotations/securityIntegration";
export * from "./annotations/verificationSync";
export * from "./apply/applyPmTransaction";
export * from "./bridge/bridgeController";
export * from "./bridge/opOrdering";
export * from "./crdt/crdtSchema";
export * from "./dirty/assertDirtyInfo";
export * from "./dirty/dirtyInfo";
// DocumentFacade - Single authority document access layer (preferred)
export * from "./facade";
export * from "./integrity/divergence";
export * from "./pm/canonicalToPm";
export * from "./pm/pmSchema";
export * from "./pm/validateBlockIds";
export * from "./policy/degradationManager";
export * from "./policy/degradationStateMachine";
export * from "./policy/policyDegradation";
export * from "./policy/policyManager";
export * from "./projection/projection";
export * from "./referenceStore/loroReferenceStore";
export * from "./runtime/loroRuntime";
export * from "./security/aiGatewayWrite";
export * from "./security/relocation";
export * from "./security/validator";
export * from "./selection/selectionMapping";
export * from "./streaming";
export * from "./sync/collabAdapter";
export * from "./sync/collabEncoding";
export * from "./sync/collabManager";
export * from "./sync/collabMessages";
export * from "./sync/syncAdapter";
export * from "./sync/webSocketCollabAdapter";
export * from "./undo/undoIntegration";
export * from "./utils/unicode";
// Canonical document model (deprecated, removed in favor of Facade)
// Use DocumentFacade for all document operations
