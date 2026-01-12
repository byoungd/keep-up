/**
 * LFCC v0.9 RC - UI Annotation Types
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/02_UI_Annotation_Panel_and_UX.md
 */

/** LFCC display states */
export type AnnotationStatus =
  | "active"
  | "active_unverified"
  | "broken_grace"
  | "active_partial"
  | "orphan";

/** Annotation kind */
export type AnnotationKind = "highlight" | "comment" | "suggestion" | string;

/** Annotation list item for panel display */
export type AnnotationListItem = {
  /** Unique annotation ID */
  annotation_id: string;
  /** Thread ID for grouping */
  thread_id?: string;
  /** Annotation kind */
  kind: AnnotationKind;
  /** Current LFCC status */
  status: AnnotationStatus;
  /** Text excerpt from annotation */
  excerpt?: string;
  /** Last update timestamp */
  updated_at_ms: number;
  /** Number of spans */
  span_count: number;
  /** Number of unresolved gaps (for partial) */
  unresolved_gap_count?: number;
  /** Author info */
  author?: {
    id: string;
    name: string;
    avatar_url?: string;
  };
  /** Comment count for threads */
  comment_count?: number;
  /** Whether annotation is resolved */
  is_resolved?: boolean;
};

/** UI adapter interface for annotation operations */
export type AnnotationUIAdapter = {
  /** List all annotation threads */
  listThreads(): Promise<AnnotationListItem[]>;
  /** Open a thread for viewing/editing */
  openThread(annotation_id: string): Promise<void>;
  /** Scroll editor to annotation location */
  scrollToAnnotation(annotation_id: string): Promise<void>;
  /** Request verification for an annotation */
  requestVerify(annotation_id: string): Promise<void>;
  /** Resolve an annotation */
  resolveAnnotation?(annotation_id: string): Promise<void>;
  /** Delete an annotation */
  deleteAnnotation?(annotation_id: string): Promise<void>;
};

/** Filter options for annotation list */
export type AnnotationFilterOptions = {
  /** Filter by status */
  status?: AnnotationStatus | "all";
  /** Filter by kind */
  kind?: AnnotationKind | "all";
  /** Filter by author ID */
  author_id?: string;
  /** Show only unresolved */
  unresolved_only?: boolean;
};

/** Sort options for annotation list */
export type AnnotationSortOption = "recency" | "status" | "author" | "kind";

/** Sort direction */
export type SortDirection = "asc" | "desc";

/** Panel state */
export type AnnotationPanelState = {
  /** Whether panel is open */
  isOpen: boolean;
  /** Currently selected annotation ID */
  selectedAnnotationId: string | null;
  /** Current filter */
  filter: AnnotationFilterOptions;
  /** Current sort */
  sort: AnnotationSortOption;
  /** Sort direction */
  sortDirection: SortDirection;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
};

/** Drag handle side */
export type HandleSide = "start" | "end";

/** Drag phase */
export type DragPhase = "start" | "move" | "end" | "cancel";

/** Handle drag event */
export type HandleDragEvent = {
  /** Annotation ID being dragged */
  annotation_id: string;
  /** Which handle is being dragged */
  handle: HandleSide;
  /** ProseMirror position hint (optional) */
  pm_pos_hint?: number;
  /** Client X coordinate */
  client_x: number;
  /** Client Y coordinate */
  client_y: number;
  /** Drag phase */
  phase: DragPhase;
  /** Timestamp */
  timestamp: number;
};

/** Handle drag callback */
export type HandleDragCallback = (event: HandleDragEvent) => void;
