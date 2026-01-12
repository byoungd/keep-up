"use client";

import type { FailClosedPayload } from "@/components/lfcc/DevFailClosedBanner";
import type { LfccEditorContextValue } from "@/components/lfcc/LfccEditorContext";
import { annotationController } from "@/lib/annotations/annotationController";
import { captureSelection } from "@/lib/dom/selection";
import { absoluteFromAnchor } from "@/lib/kernel/anchors";
import type { AnnotationColor } from "@/lib/kernel/types";
import { lift, setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import type { MarkType, NodeType, ResolvedPos } from "prosemirror-model";
import { wrapInList } from "prosemirror-schema-list";
import { type EditorState, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import * as React from "react";

const HIGHLIGHT_COLORS: readonly AnnotationColor[] = ["yellow", "green", "red", "purple"];

type CreateAnnotationDetail = {
  color: AnnotationColor;
};

type FormatActionName =
  | "bold"
  | "italic"
  | "code"
  | "h1"
  | "h2"
  | "list"
  | "quote"
  | "link"
  | "unlink";

type FormatActionDetail = {
  format: FormatActionName;
  url?: string;
};

type SelectionToolbarActionOptions = {
  lfcc: LfccEditorContextValue | null;
  onFailClosed?: (info: FailClosedPayload) => void;
};

const TOOLBAR_ACTIVE_CLASS_MAP = {
  bold: "lfcc-toolbar-active-bold",
  italic: "lfcc-toolbar-active-italic",
  code: "lfcc-toolbar-active-code",
  link: "lfcc-toolbar-active-link",
  h1: "lfcc-toolbar-active-h1",
  h2: "lfcc-toolbar-active-h2",
  list: "lfcc-toolbar-active-list",
  quote: "lfcc-toolbar-active-quote",
} as const;

type ToolbarActiveKey = keyof typeof TOOLBAR_ACTIVE_CLASS_MAP;
type ToolbarActiveState = Record<ToolbarActiveKey, boolean>;

const isHighlightColor = (value: unknown): value is AnnotationColor =>
  typeof value === "string" && HIGHLIGHT_COLORS.some((color) => color === value);

const isCreateAnnotationDetail = (detail: unknown): detail is CreateAnnotationDetail => {
  if (!detail || typeof detail !== "object") {
    return false;
  }
  const color = (detail as { color?: unknown }).color;
  return isHighlightColor(color);
};

const isFormatActionDetail = (detail: unknown): detail is FormatActionDetail => {
  if (!detail || typeof detail !== "object") {
    return false;
  }
  const format = (detail as { format?: unknown }).format;
  const validFormats: FormatActionName[] = [
    "bold",
    "italic",
    "code",
    "h1",
    "h2",
    "list",
    "quote",
    "link",
    "unlink",
  ];
  return typeof format === "string" && validFormats.some((value) => value === format);
};

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

const isMarkActive = (state: EditorState, markType: MarkType) => {
  const { from, to, empty, $from } = state.selection;
  if (empty) {
    return Boolean(markType.isInSet(state.storedMarks || $from.marks()));
  }
  return state.doc.rangeHasMark(from, to, markType);
};

const toggleInlineMark = (
  state: EditorState,
  dispatch: EditorView["dispatch"],
  markType: MarkType
) => {
  if (!dispatch) {
    return false;
  }

  const { from, to, empty } = state.selection;
  if (isMarkActive(state, markType)) {
    if (empty) {
      dispatch(state.tr.removeStoredMark(markType));
      return true;
    }
    dispatch(state.tr.removeMark(from, to, markType));
    return true;
  }

  return toggleMark(markType)(state, dispatch);
};

const isToolbarEventTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest('[data-testid="selection-toolbar"]'));
};

const applyMarkAction = (
  state: EditorState,
  dispatch: EditorView["dispatch"],
  markType?: MarkType
): boolean => (markType ? toggleInlineMark(state, dispatch, markType) : false);

const applyHeadingAction = (
  state: EditorState,
  dispatch: EditorView["dispatch"],
  headingType: NodeType | undefined,
  level: number
): boolean => (headingType ? setBlockType(headingType, { level })(state, dispatch) : false);

const applyListAction = (
  state: EditorState,
  dispatch: EditorView["dispatch"],
  listType?: NodeType
): boolean => {
  if (!listType) {
    return false;
  }
  // Check if we're inside a list item - if so, lift out of list
  const listItemType = getListItemType(state);
  if (listItemType && isBlockActive(state, listItemType)) {
    return lift(state, dispatch);
  }
  return wrapInList(listType)(state, dispatch);
};

const applyQuoteAction = (
  state: EditorState,
  dispatch: EditorView["dispatch"],
  quoteType?: NodeType
): boolean => {
  if (!quoteType) {
    return false;
  }
  if (isBlockActive(state, quoteType)) {
    return lift(state, dispatch);
  }
  return wrapIn(quoteType)(state, dispatch);
};

const applyLinkAction = (
  state: EditorState,
  dispatch: EditorView["dispatch"],
  linkType: MarkType | undefined,
  url?: string
): boolean => {
  if (!linkType) {
    return false;
  }
  const href = url?.trim();
  if (!href) {
    return false;
  }
  return toggleMark(linkType, { href })(state, dispatch);
};

const applyUnlinkAction = (
  state: EditorState,
  dispatch: EditorView["dispatch"],
  linkType: MarkType | undefined
): boolean => {
  if (!linkType || !dispatch) {
    return false;
  }
  const { selection } = state;
  dispatch(state.tr.removeMark(selection.from, selection.to, linkType));
  return true;
};

const applyFormatAction = (view: EditorView, action: FormatActionDetail): boolean => {
  const { state, dispatch } = view;
  const { schema } = state;
  const quoteType = schema.nodes.quote ?? schema.nodes.blockquote;

  switch (action.format) {
    case "bold":
      return applyMarkAction(state, dispatch, schema.marks.bold);
    case "italic":
      return applyMarkAction(state, dispatch, schema.marks.italic);
    case "code":
      return applyMarkAction(state, dispatch, schema.marks.code);
    case "h1":
      return applyHeadingAction(state, dispatch, schema.nodes.heading, 1);
    case "h2":
      return applyHeadingAction(state, dispatch, schema.nodes.heading, 2);
    case "list":
      return applyListAction(state, dispatch, schema.nodes.list);
    case "quote":
      return applyQuoteAction(state, dispatch, quoteType);
    case "link":
      return applyLinkAction(state, dispatch, schema.marks.link, action.url);
    case "unlink":
      return applyUnlinkAction(state, dispatch, schema.marks.link);
  }
};

const clampSelection = (view: EditorView, from: number, to: number): TextSelection | null => {
  const min = Math.max(1, Math.min(from, to));
  const max = Math.max(1, Math.max(from, to));
  const maxPos = Math.max(1, view.state.doc.content.size - 1);
  const safeFrom = Math.min(min, maxPos);
  const safeTo = Math.min(max, maxPos);
  if (safeFrom === safeTo) {
    return null;
  }
  return TextSelection.create(view.state.doc, safeFrom, safeTo);
};

const collapseSelection = (view: EditorView) => {
  const maxPos = Math.max(1, view.state.doc.content.size - 1);
  const target = Math.min(Math.max(1, view.state.selection.to), maxPos);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, target)));
};

const isSelectionInsideView = (view: EditorView): boolean => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }
  const anchorNode = selection.anchorNode;
  if (!anchorNode) {
    return false;
  }
  return view.dom.contains(anchorNode);
};

const shouldRestoreSelection = (view: EditorView): boolean =>
  !isSelectionInsideView(view) || view.state.selection.from === view.state.selection.to;

const markActive = (state: EditorState, markType?: MarkType): boolean =>
  Boolean(markType && isMarkActive(state, markType));

const blockActive = (
  state: EditorState,
  nodeType: NodeType | null,
  attrs?: Record<string, unknown>
): boolean => Boolean(nodeType && isBlockActive(state, nodeType, attrs));

const getListItemType = (state: EditorState): NodeType | null =>
  state.schema.nodes.list_item ?? state.schema.nodes.listItem ?? null;

const getQuoteType = (state: EditorState): NodeType | null =>
  state.schema.nodes.quote ?? state.schema.nodes.blockquote ?? null;

const getToolbarActiveStates = (state: EditorState): ToolbarActiveState => {
  const listItemType = getListItemType(state);
  const quoteType = getQuoteType(state);

  return {
    bold: markActive(state, state.schema.marks.bold),
    italic: markActive(state, state.schema.marks.italic),
    code: markActive(state, state.schema.marks.code),
    link: markActive(state, state.schema.marks.link),
    h1: blockActive(state, state.schema.nodes.heading ?? null, { level: 1 }),
    h2: blockActive(state, state.schema.nodes.heading ?? null, { level: 2 }),
    list: blockActive(state, listItemType),
    quote: blockActive(state, quoteType),
  };
};

const clearToolbarActiveStates = (root: HTMLElement): void => {
  for (const className of Object.values(TOOLBAR_ACTIVE_CLASS_MAP)) {
    root.classList.remove(className);
  }
};

const applyToolbarActiveStates = (root: HTMLElement, activeStates: ToolbarActiveState): void => {
  for (const [key, className] of Object.entries(TOOLBAR_ACTIVE_CLASS_MAP)) {
    root.classList.toggle(className, Boolean(activeStates[key as ToolbarActiveKey]));
  }
};

export function useSelectionToolbarActions({
  lfcc,
  onFailClosed,
}: SelectionToolbarActionOptions): void {
  const lastSelectionRef = React.useRef<{ from: number; to: number } | null>(null);

  const updateToolbarActiveStates = React.useCallback((view: EditorView | null) => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.body;
    if (!view || !isSelectionInsideView(view)) {
      clearToolbarActiveStates(root);
      return;
    }

    const activeStates = getToolbarActiveStates(view.state);
    applyToolbarActiveStates(root, activeStates);
  }, []);

  React.useEffect(() => {
    if (!lfcc?.view) {
      updateToolbarActiveStates(null);
      return;
    }

    const updateSelection = () => {
      if (!lfcc.view || !isSelectionInsideView(lfcc.view)) {
        updateToolbarActiveStates(lfcc.view);
        return;
      }
      const { from, to } = lfcc.view.state.selection;
      if (from === to) {
        updateToolbarActiveStates(lfcc.view);
        return;
      }
      lastSelectionRef.current = { from, to };
      updateToolbarActiveStates(lfcc.view);
    };

    const handleToolbarPointerDown = (event: PointerEvent) => {
      if (!isToolbarEventTarget(event.target)) {
        return;
      }
      event.preventDefault();
    };

    document.addEventListener("selectionchange", updateSelection);
    document.addEventListener("keyup", updateSelection);
    document.addEventListener("mouseup", updateSelection);
    document.addEventListener("pointerdown", handleToolbarPointerDown, true);

    return () => {
      document.removeEventListener("selectionchange", updateSelection);
      document.removeEventListener("keyup", updateSelection);
      document.removeEventListener("mouseup", updateSelection);
      document.removeEventListener("pointerdown", handleToolbarPointerDown, true);
      updateToolbarActiveStates(null);
    };
  }, [lfcc, updateToolbarActiveStates]);

  const restoreSelectionIfNeeded = React.useCallback((view: EditorView) => {
    if (!shouldRestoreSelection(view)) {
      return;
    }

    const lastSelection = lastSelectionRef.current;
    if (!lastSelection) {
      return;
    }

    const restored = clampSelection(view, lastSelection.from, lastSelection.to);
    if (!restored) {
      return;
    }
    view.dispatch(view.state.tr.setSelection(restored));
  }, []);

  const handleCreateAnnotationEvent = React.useCallback(
    (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      if (!isCreateAnnotationDetail(event.detail)) {
        return;
      }

      if (lfcc?.view && lfcc.runtime) {
        lfcc.view.focus();
        restoreSelectionIfNeeded(lfcc.view);

        const result = annotationController.createFromSelection({
          view: lfcc.view,
          runtime: lfcc.runtime,
          color: event.detail.color,
          chainPolicy: { kind: "required_order", maxInterveningBlocks: 0 },
          strict: true,
        });

        if (!result.ok) {
          onFailClosed?.({ message: result.error, payload: result.debugPayload });
          return;
        }

        collapseSelection(lfcc.view);
        lfcc.view.focus();
        return;
      }

      const selection = captureSelection();
      if (!selection) {
        return;
      }

      const start = absoluteFromAnchor(selection.start);
      const end = absoluteFromAnchor(selection.end);
      if (!start || !end) {
        onFailClosed?.({
          message: "Unable to decode selection anchors.",
          payload: { start: selection.start, end: selection.end },
        });
        return;
      }
      annotationController.createAnnotation({
        spanList: [
          {
            blockId: start.blockId,
            start: start.offset,
            end: end.offset,
          },
        ],
        content: selection.text,
        color: event.detail.color,
      });

      window.getSelection()?.removeAllRanges();
    },
    [lfcc, onFailClosed, restoreSelectionIfNeeded]
  );

  const handleFormatActionEvent = React.useCallback(
    (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      if (!lfcc?.view) {
        return;
      }
      if (!isFormatActionDetail(event.detail)) {
        return;
      }

      lfcc.view.focus();
      restoreSelectionIfNeeded(lfcc.view);

      const applied = applyFormatAction(lfcc.view, event.detail);
      if (applied) {
        lfcc.view.focus();
        updateToolbarActiveStates(lfcc.view);
      }
    },
    [lfcc, restoreSelectionIfNeeded, updateToolbarActiveStates]
  );

  const handleDeleteAnnotationEvent = React.useCallback((event: Event) => {
    if (!(event instanceof CustomEvent)) {
      return;
    }
    const detail = event.detail as { annotationId?: string } | undefined;
    if (!detail?.annotationId) {
      return;
    }
    annotationController.removeAnnotation(detail.annotationId);
  }, []);

  const handleUpdateAnnotationColorEvent = React.useCallback((event: Event) => {
    if (!(event instanceof CustomEvent)) {
      return;
    }
    const detail = event.detail as { annotationId?: string; color?: string } | undefined;
    if (!detail?.annotationId || !detail?.color) {
      return;
    }
    if (!isHighlightColor(detail.color)) {
      return;
    }
    annotationController.updateAnnotationColor(detail.annotationId, detail.color);
  }, []);

  React.useEffect(() => {
    window.addEventListener("lfcc-create-annotation", handleCreateAnnotationEvent);
    window.addEventListener("lfcc-format-action", handleFormatActionEvent);
    window.addEventListener("lfcc-delete-annotation", handleDeleteAnnotationEvent);
    window.addEventListener("lfcc-update-annotation-color", handleUpdateAnnotationColorEvent);

    return () => {
      window.removeEventListener("lfcc-create-annotation", handleCreateAnnotationEvent);
      window.removeEventListener("lfcc-format-action", handleFormatActionEvent);
      window.removeEventListener("lfcc-delete-annotation", handleDeleteAnnotationEvent);
      window.removeEventListener("lfcc-update-annotation-color", handleUpdateAnnotationColorEvent);
    };
  }, [
    handleCreateAnnotationEvent,
    handleFormatActionEvent,
    handleDeleteAnnotationEvent,
    handleUpdateAnnotationColorEvent,
  ]);
}
