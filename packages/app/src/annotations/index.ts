/**
 * LFCC v0.9 RC - UI Annotation Module
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/02_UI_Annotation_Panel_and_UX.md
 *
 * UI layer for LFCC annotations:
 * - Annotation Panel (threads, status, navigation)
 * - Visual Spec (design tokens)
 * - Drag Handle Interaction Shell
 */

// Types
export * from "./types";

// Visual Spec
export {
  ANIMATION,
  ANNOTATION_HIGHLIGHT_COLORS,
  BORDER_STYLES,
  BORDER_WIDTHS,
  KIND_COLORS,
  STATUS_COLORS,
  STATUS_ICONS,
  STATUS_LABELS,
  getAnnotationHighlightColor,
  generateAllCss,
  generateBadgeCss,
  generateCssVariables,
  generateHighlightCss,
  getBadgeStyle,
  getHighlightStyle,
  getKindColor,
  type AnnotationHighlightColor,
} from "./visualSpec";

// Panel State
export {
  INITIAL_PANEL_STATE,
  calculateStats,
  clearError,
  closePanel,
  filterAnnotations,
  filterAnnotationsByStatuses,
  groupByThread,
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
  type AnnotationStats,
  type GroupedAnnotations,
} from "./panelState";

// Mock Adapter
export {
  createMockAdapter,
  defaultMockAdapter,
  type MockAdapterCallbacks,
} from "./mockAdapter";

// Drag Handle
export {
  DragHandleController,
  INITIAL_DRAG_STATE,
  destroyDragHandleController,
  findHandleAtPoint,
  generateHandleCss,
  getDragHandleController,
  isPointInHandle,
  type DragHandleState,
  type HandleHitTarget,
} from "./dragHandle";
