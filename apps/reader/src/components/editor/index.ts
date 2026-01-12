/**
 * Editor Components
 *
 * Exports for editor-related components and hooks.
 */

// Context menus
export { AIContextMenu } from "./AIContextMenu";
export { BlockContextMenu } from "./BlockContextMenu";

// Block handling
export { BlockHandlePortal } from "./BlockHandlePortal";
export { BlockHoverGutter } from "./BlockHoverGutter";

// Slash commands
export { SlashCommandMenu } from "./SlashCommandMenu";
export { SlashMenuPortal } from "./SlashMenuPortal";

// Diff views
export { StructuralDiff } from "./StructuralDiff";
export { SuggestionDiff } from "./SuggestionDiff";

// Conflict resolution
export { ConflictResolutionModal } from "./ConflictResolutionModal";

// P1.3: Virtualization
export {
  VirtualizedBlockList,
  type VirtualBlock,
  type VirtualizationConfig,
  type VirtualizationMetrics,
  type VirtualizedBlockListProps,
  createBlockHeightEstimator,
  DEFAULT_BLOCK_HEIGHTS,
  useVirtualMetrics,
  useScrollToBlock,
} from "./VirtualizedBlockList";

export {
  useVirtualizedEditor,
  useVirtualizationPerformance,
  useBlockPrefetch,
  type VirtualizedEditorOptions,
  type VirtualizedEditorState,
} from "./useVirtualizedEditor";
