/**
 * LFCC v0.9 RC - UI Annotation Module
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/02_UI_Annotation_Panel_and_UX.md
 *
 * UI layer for LFCC annotations:
 * - Annotation Panel (threads, status, navigation)
 * - Visual Spec (design tokens)
 * - Drag Handle Interaction Shell
 */

// Drag Handle
export {
  DragHandleController,
  type DragHandleState,
  destroyDragHandleController,
  findHandleAtPoint,
  generateHandleCss,
  getDragHandleController,
  type HandleHitTarget,
  INITIAL_DRAG_STATE,
  isPointInHandle,
} from "./dragHandle";
export {
  DragHandleControllerProvider,
  useDragHandleController,
} from "./dragHandleContext";
// Mock Adapter
export {
  createMockAdapter,
  defaultMockAdapter,
  type MockAdapterCallbacks,
} from "./mockAdapter";

// Panel State
export {
  type AnnotationStats,
  calculateStats,
  clearError,
  closePanel,
  filterAnnotations,
  filterAnnotationsByStatuses,
  type GroupedAnnotations,
  groupByThread,
  INITIAL_PANEL_STATE,
  openPanel,
  processAnnotations,
  selectAnnotation,
  setError,
  setFilter,
  setLoading,
  setSort,
  sortAnnotations,
  togglePanel,
  toggleSortDirection,
} from "./panelState";
// Types
export * from "./types";
// Visual Spec
export {
  ANIMATION,
  ANNOTATION_HIGHLIGHT_COLORS,
  type AnnotationHighlightColor,
  BORDER_STYLES,
  BORDER_WIDTHS,
  generateAllCss,
  generateBadgeCss,
  generateCssVariables,
  generateHighlightCss,
  getAnnotationHighlightColor,
  getBadgeStyle,
  getHighlightStyle,
  getKindColor,
  KIND_COLORS,
  STATUS_COLORS,
  STATUS_ICONS,
  STATUS_LABELS,
} from "./visualSpec";
