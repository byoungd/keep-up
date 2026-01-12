"use client";

import { LinkInputPopover } from "@/components/annotations/LinkInputPopover";
import {
  type FailClosedBannerState,
  useFailClosedBanner,
} from "@/components/annotations/useFailClosedBanner";
import { useSelectionToolbarPosition } from "@/components/annotations/useSelectionToolbarPosition";
import { DevFailClosedBanner } from "@/components/lfcc/DevFailClosedBanner";
import { useLfccEditorContext } from "@/components/lfcc/LfccEditorContext";
import { subscribeToDragPreview } from "@/lib/annotations/annotationPlugin";
import { type SelectionResult, captureSelection } from "@/lib/dom/selection";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  type LucideIcon,
  Quote,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { MarkType, NodeType, ResolvedPos } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AnnotationContext {
  annotationId: string | null;
  position: { x: number; y: number } | null;
}

type ToolbarFormatState = {
  bold: boolean;
  italic: boolean;
  code: boolean;
  link: boolean;
  h1: boolean;
  h2: boolean;
  list: boolean;
  quote: boolean;
};

const EMPTY_FORMAT_STATE: ToolbarFormatState = {
  bold: false,
  italic: false,
  code: false,
  link: false,
  h1: false,
  h2: false,
  list: false,
  quote: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions (extracted for complexity reduction)
// ─────────────────────────────────────────────────────────────────────────────

/** Get the first span's bounding rect for multi-paragraph annotations */
function getAnnotationSpanRect(annotationEl: HTMLElement, annoId: string): DOMRect {
  const allSpans = document.querySelectorAll<HTMLElement>(
    `.lfcc-annotation[data-annotation-id="${annoId}"]`
  );
  const firstSpan = allSpans[0] ?? annotationEl;
  return firstSpan.getBoundingClientRect();
}

/** Detect if cursor is inside an annotation and return context */
function detectAnnotationAtCursor(): AnnotationContext {
  const domSelection = window.getSelection();
  if (!domSelection?.anchorNode) {
    return { annotationId: null, position: null };
  }

  const anchorEl =
    domSelection.anchorNode instanceof Element
      ? domSelection.anchorNode
      : domSelection.anchorNode.parentElement;

  const annotationEl = anchorEl?.closest<HTMLElement>(".lfcc-annotation[data-annotation-id]");
  if (!annotationEl) {
    return { annotationId: null, position: null };
  }

  const annoId = annotationEl.getAttribute("data-annotation-id");
  if (!annoId) {
    return { annotationId: null, position: null };
  }

  // PERF-008 FIX: Use first span's position to prevent toolbar jumping
  const rect = getAnnotationSpanRect(annotationEl, annoId);
  return {
    annotationId: annoId,
    position: { x: rect.left + rect.width / 2, y: rect.top },
  };
}

function isSelectionInsideView(view: EditorView): boolean {
  const selection = window.getSelection();
  if (!selection?.anchorNode) {
    return false;
  }
  return view.dom.contains(selection.anchorNode);
}

const hasAncestorOfType = (
  $pos: ResolvedPos,
  nodeType: NodeType,
  attrs?: Record<string, unknown>
): boolean => {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type !== nodeType) {
      continue;
    }
    if (!attrs) {
      return true;
    }
    const matches = Object.entries(attrs).every(([key, value]) => node.attrs[key] === value);
    if (matches) {
      return true;
    }
  }
  return false;
};

const isBlockActive = (state: EditorState, nodeType: NodeType, attrs?: Record<string, unknown>) => {
  const { $from, $to } = state.selection;
  return hasAncestorOfType($from, nodeType, attrs) && hasAncestorOfType($to, nodeType, attrs);
};

const isMarkActive = (state: EditorState, markType: MarkType): boolean => {
  const { from, to, empty, $from } = state.selection;
  if (empty) {
    return Boolean(markType.isInSet(state.storedMarks || $from.marks()));
  }
  return state.doc.rangeHasMark(from, to, markType);
};

const getListItemType = (state: EditorState): NodeType | null =>
  state.schema.nodes.list_item ?? state.schema.nodes.listItem ?? null;

const getQuoteType = (state: EditorState): NodeType | null =>
  state.schema.nodes.quote ?? state.schema.nodes.blockquote ?? null;

const getToolbarFormatState = (state: EditorState): ToolbarFormatState => {
  const listItemType = getListItemType(state);
  const quoteType = getQuoteType(state);

  return {
    bold: Boolean(state.schema.marks.bold && isMarkActive(state, state.schema.marks.bold)),
    italic: Boolean(state.schema.marks.italic && isMarkActive(state, state.schema.marks.italic)),
    code: Boolean(state.schema.marks.code && isMarkActive(state, state.schema.marks.code)),
    link: Boolean(state.schema.marks.link && isMarkActive(state, state.schema.marks.link)),
    h1: Boolean(
      state.schema.nodes.heading && isBlockActive(state, state.schema.nodes.heading, { level: 1 })
    ),
    h2: Boolean(
      state.schema.nodes.heading && isBlockActive(state, state.schema.nodes.heading, { level: 2 })
    ),
    list: Boolean(listItemType && isBlockActive(state, listItemType)),
    quote: Boolean(quoteType && isBlockActive(state, quoteType)),
  };
};

const getSelectionLinkHref = (state: EditorState): string | null => {
  const linkType = state.schema.marks.link;
  if (!linkType) {
    return null;
  }

  const { from, to, empty, $from } = state.selection;
  if (empty) {
    const link = linkType.isInSet(state.storedMarks || $from.marks());
    return link?.attrs?.href ? String(link.attrs.href) : null;
  }

  let href: string | null = null;
  state.doc.nodesBetween(from, to, (node) => {
    const link = linkType.isInSet(node.marks);
    if (link?.attrs?.href) {
      href = String(link.attrs.href);
      return false;
    }
    return true;
  });
  return href;
};

interface SelectionToolbarProps {
  onAskAI?: (rect: DOMRect) => void;
  failClosedState?: FailClosedBannerState;
  isReadOnly?: boolean;
}

export function SelectionToolbar({ onAskAI, failClosedState, isReadOnly }: SelectionToolbarProps) {
  const lfcc = useLfccEditorContext();
  const [selection, setSelection] = useState<SelectionResult | null>(null);
  const position = useSelectionToolbarPosition(selection);

  // Active annotation when cursor is inside a highlight (for delete)
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [annotationPosition, setAnnotationPosition] = useState<{ x: number; y: number } | null>(
    null
  );

  const [formatState, setFormatState] = useState<ToolbarFormatState>(EMPTY_FORMAT_STATE);
  const [currentLinkHref, setCurrentLinkHref] = useState("");

  // Track annotation handle drag state - suppress toolbar during drag
  const [isAnnotationDragging, setIsAnnotationDragging] = useState(false);

  useEffect(() => {
    return subscribeToDragPreview((preview) => {
      setIsAnnotationDragging(preview !== null);
    });
  }, []);

  // Link popover state
  const [linkPopover, setLinkPopover] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    currentUrl: string;
  }>({ isOpen: false, x: 0, y: 0, currentUrl: "" });

  // Ref to track link popover open state for use in event handlers
  const linkPopoverOpenRef = useRef(false);
  linkPopoverOpenRef.current = linkPopover.isOpen;

  const internalFailClosed = useFailClosedBanner(process.env.NODE_ENV !== "production");
  const activeFailClosedState = failClosedState || internalFailClosed;

  const updateFormatState = useCallback(() => {
    if (!lfcc?.view) {
      setFormatState(EMPTY_FORMAT_STATE);
      if (!linkPopoverOpenRef.current) {
        setCurrentLinkHref("");
      }
      return;
    }

    if (!isSelectionInsideView(lfcc.view)) {
      setFormatState(EMPTY_FORMAT_STATE);
      if (!linkPopoverOpenRef.current) {
        setCurrentLinkHref("");
      }
      return;
    }

    const nextState = getToolbarFormatState(lfcc.view.state);
    setFormatState(nextState);

    if (!linkPopoverOpenRef.current) {
      const href = getSelectionLinkHref(lfcc.view.state);
      setCurrentLinkHref(href ?? "");
    }
  }, [lfcc]);

  const scheduleFormatStateSync = useCallback(() => {
    requestAnimationFrame(() => {
      updateFormatState();
    });
  }, [updateFormatState]);

  const closeLinkPopover = useCallback(() => {
    linkPopoverOpenRef.current = false;
    setLinkPopover((prev) => ({ ...prev, isOpen: false }));
  }, []);

  useEffect(() => {
    // Standard selection capture - listening on document
    const handleSelectionChange = () => {
      // Capture the current selection
      const result = captureSelection();
      setSelection(result);

      // Check for annotation at cursor position (even if collapsed)
      const annotationContext = detectAnnotationAtCursor();
      setActiveAnnotationId(annotationContext.annotationId);
      setAnnotationPosition(annotationContext.position);

      // If no valid selection, ensure we clean up
      // BUT don't close link popover if it's open (user is typing URL)
      if (!result && !linkPopoverOpenRef.current) {
        setLinkPopover((prev) => ({ ...prev, isOpen: false }));
      }

      updateFormatState();
    };

    // Use selectionchange for real-time updates
    document.addEventListener("selectionchange", handleSelectionChange);
    // Also keyup/mouseup to ensure final state is captured
    document.addEventListener("keyup", handleSelectionChange);
    document.addEventListener("mouseup", handleSelectionChange);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("keyup", handleSelectionChange);
      document.removeEventListener("mouseup", handleSelectionChange);
    };
  }, [updateFormatState]);

  const handleFormat = (format: string) => {
    window.dispatchEvent(
      new CustomEvent("lfcc-format-action", {
        detail: { format },
      })
    );
    scheduleFormatStateSync();
  };

  const handleCreate = (color: string) => {
    // If user has a text selection, always create new annotation
    // (even if cursor is inside an existing annotation)
    if (selection) {
      window.dispatchEvent(
        new CustomEvent("lfcc-create-annotation", {
          detail: { color },
        })
      );
      return;
    }

    // If no text selection but cursor is inside an annotation, update its color
    if (activeAnnotationId) {
      window.dispatchEvent(
        new CustomEvent("lfcc-update-annotation-color", {
          detail: { annotationId: activeAnnotationId, color },
        })
      );
      return;
    }
  };

  const handleLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!position) {
      return;
    }

    // Toggle link popover
    if (linkPopover.isOpen) {
      closeLinkPopover();
    } else {
      linkPopoverOpenRef.current = true;
      setLinkPopover({
        isOpen: true,
        x: position.x,
        y: position.y + 40,
        currentUrl: currentLinkHref,
      });
    }
  };

  const handleLinkApply = (url: string) => {
    window.dispatchEvent(
      new CustomEvent("lfcc-format-action", {
        detail: { format: "link", url },
      })
    );
    closeLinkPopover();
    scheduleFormatStateSync();
  };

  const handleLinkCancel = () => {
    closeLinkPopover();
  };

  const handleLinkRemove = () => {
    window.dispatchEvent(
      new CustomEvent("lfcc-format-action", {
        detail: { format: "unlink" },
      })
    );
    closeLinkPopover();
    scheduleFormatStateSync();
  };

  const handleDelete = () => {
    if (!activeAnnotationId) {
      return;
    }
    window.dispatchEvent(
      new CustomEvent("lfcc-delete-annotation", {
        detail: { annotationId: activeAnnotationId },
      })
    );
    setActiveAnnotationId(null);
    setAnnotationPosition(null);
  };

  // Show toolbar if: (1) there's a text selection OR (2) cursor is inside an annotation
  // BUT suppress during annotation handle drag to avoid interference
  const hasTextSelection = !!selection && !!position;
  const hasAnnotationContext = !!activeAnnotationId && !!annotationPosition;
  const showToolbar =
    (hasTextSelection || hasAnnotationContext) && !isReadOnly && !isAnnotationDragging;
  const toolbarPosition = position ?? annotationPosition;
  const isMobile =
    typeof window !== "undefined" ? window.matchMedia("(max-width: 768px)").matches : false;
  const { bold: isBold, italic: isItalic, code: isCode, link: isLink } = formatState;
  const { h1: isH1, h2: isH2, list: isList, quote: isQuote } = formatState;

  return (
    <>
      {activeFailClosedState.failClosed && (
        <DevFailClosedBanner
          info={activeFailClosedState.failClosed}
          onClear={activeFailClosedState.clearFailClosed}
        />
      )}

      <AnimatePresence>
        {showToolbar && toolbarPosition && (
          <div className="fixed z-50" style={buildPosition(toolbarPosition)}>
            <motion.div
              data-testid="selection-toolbar"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
              className={cn(
                "flex items-center gap-1 rounded-lg px-1.5 py-1",
                "border backdrop-blur-xl shadow-xl",
                // Subtle, professional appearance
                "bg-surface-1/95 border-border/40",
                "shadow-black/10 dark:shadow-black/40",
                "pointer-events-auto",
                isMobile && "flex-wrap max-w-[90vw]"
              )}
            >
              {/* AI - Subtle accent, not shouting */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAskAI?.(e.currentTarget.getBoundingClientRect());
                }}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer",
                  "text-primary hover:text-primary/80",
                  "hover:bg-primary/5 active:bg-primary/10"
                )}
                title="Ask AI"
                aria-label="Ask AI"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">AI</span>
              </button>

              <Divider />

              {/* Formatting - Minimal icons */}
              <ToolbarButton
                icon={Bold}
                onClick={() => handleFormat("bold")}
                label="Bold"
                isActive={!!isBold}
              />
              <ToolbarButton
                icon={Italic}
                onClick={() => handleFormat("italic")}
                label="Italic"
                isActive={!!isItalic}
              />
              <ToolbarButton
                icon={Code}
                onClick={() => handleFormat("code")}
                label="Code"
                isActive={!!isCode}
              />
              <ToolbarButton
                icon={LinkIcon}
                onClick={handleLinkClick}
                label="Link"
                isActive={!!isLink}
              />

              <Divider />

              {/* Block types */}
              <ToolbarButton
                icon={Heading1}
                onClick={() => handleFormat("h1")}
                label="Heading 1"
                isActive={!!isH1}
              />
              <ToolbarButton
                icon={Heading2}
                onClick={() => handleFormat("h2")}
                label="Heading 2"
                isActive={!!isH2}
              />
              <ToolbarButton
                icon={List}
                onClick={() => handleFormat("list")}
                label="List"
                isActive={!!isList}
              />
              <ToolbarButton
                icon={Quote}
                onClick={() => handleFormat("quote")}
                label="Quote"
                isActive={!!isQuote}
              />

              <Divider />

              {/* Highlight colors - Discrete dots */}
              <div className="flex items-center gap-1 px-1">
                <ColorButton color="yellow" onClick={() => handleCreate("yellow")} />
                <ColorButton color="green" onClick={() => handleCreate("green")} />
                <ColorButton color="red" onClick={() => handleCreate("red")} />
                <ColorButton color="purple" onClick={() => handleCreate("purple")} />
              </div>

              {/* Delete button - only shown when cursor is inside an annotation */}
              {activeAnnotationId && (
                <>
                  <Divider />
                  <ToolbarButton
                    icon={Trash2}
                    onClick={handleDelete}
                    label="Delete Highlight"
                    isActive={false}
                    isToggle={false}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  />
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Link Popover */}
      <LinkInputPopover
        isOpen={linkPopover.isOpen}
        x={linkPopover.x}
        y={linkPopover.y}
        currentUrl={linkPopover.currentUrl}
        onApply={handleLinkApply}
        onCancel={handleLinkCancel}
        onRemove={linkPopover.currentUrl ? handleLinkRemove : undefined}
      />
    </>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-border/60" />;
}

function buildPosition(position: { x: number; y: number } | null) {
  const base = {
    top: position?.y ?? 0,
    left: position?.x ?? 0,
    transform: "translate(-50%, calc(-100% - 12px))",
    pointerEvents: "none" as const,
  };
  if (typeof window === "undefined") {
    return base;
  }
  const prefersBottom = window.matchMedia("(max-width: 768px)").matches;
  if (prefersBottom) {
    return {
      ...base,
      top: "auto",
      left: "50%",
      right: "50%",
      bottom: 16,
      transform: "translate(-50%, 0)",
    };
  }
  return base;
}

function ToolbarButton({
  icon: Icon,
  onClick,
  label,
  isActive,
  isToggle = true,
  className,
}: {
  icon: LucideIcon;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  label: string;
  isActive?: boolean;
  isToggle?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      // Prevent mousedown from stealing focus from editor
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
      className={cn(
        "flex items-center justify-center w-7 h-7 rounded-md transition-all active:scale-95 cursor-pointer",
        isActive
          ? "bg-primary/10 text-primary shadow-sm"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        className
      )}
      title={label}
      aria-label={label}
      aria-pressed={isToggle && isActive !== undefined ? isActive : undefined}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
  );
}

function ColorButton({ color, onClick }: { color: string; onClick: () => void }) {
  const colorMap: Record<string, string> = {
    yellow: "bg-accent-amber hover:ring-accent-amber/40",
    green: "bg-accent-emerald hover:ring-accent-emerald/40",
    red: "bg-destructive hover:ring-destructive/40",
    purple: "bg-accent-indigo hover:ring-accent-indigo/40",
  };

  return (
    <button
      type="button"
      // Prevent mousedown from stealing focus from editor
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "w-3.5 h-3.5 rounded-full transition-all active:scale-95 cursor-pointer",
        "ring-2 ring-transparent hover:ring-offset-1 ring-offset-background",
        colorMap[color]
      )}
      title={`Highlight ${color}`}
      aria-label={`Highlight ${color}`}
    />
  );
}
