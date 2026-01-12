import {
  createLoroRuntime,
  nextBlockId,
  pmSchema,
  projectLoroToPm,
  serializeAttrs,
  writeBlockTree,
} from "@keepup/lfcc-bridge";
import { EditorState } from "prosemirror-state";
import type { DecorationSet, EditorView } from "prosemirror-view";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anchorFromAbsolute } from "../../kernel/anchors";
import { useAnnotationStore } from "../../kernel/store";
import type { Annotation } from "../../kernel/types";
import { annotationController } from "../annotationController";
import { createAnnotationPlugin } from "../annotationPlugin";

const resetStore = () => {
  useAnnotationStore.setState({ annotations: {}, focusedAnnotationId: null });
};

const stubRaf = () => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 16)
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    clearTimeout(id);
  });
};

type SetupResult = {
  view: EditorView;
  plugin: ReturnType<typeof createAnnotationPlugin>;
  pluginView: {
    destroy?: () => void;
    update?: (view: EditorView, prevState: EditorState) => void;
  } | null;
  handle: HTMLSpanElement;
  annotation: Annotation;
  blockId: string;
};

const setup = (onFailClosed?: (payload: { message: string }) => void): SetupResult => {
  const runtime = createLoroRuntime({ peerId: "1" });
  const attrs = serializeAttrs({});
  const block = {
    id: nextBlockId(runtime.doc),
    type: "paragraph" as const,
    attrs,
    text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    children: [],
  };
  writeBlockTree(runtime.doc, [block]);

  const pmDoc = projectLoroToPm(runtime.doc, pmSchema);
  const state = EditorState.create({ schema: pmSchema, doc: pmDoc });

  const annotation: Annotation = {
    id: "anno-1",
    start: anchorFromAbsolute(block.id, 0),
    end: anchorFromAbsolute(block.id, 5),
    content: "Lorem",
    storedState: "active",
    displayState: "active",
    createdAtMs: 0,
    spans: [{ blockId: block.id, start: 0, end: 5 }],
    chain: {
      policy: { kind: "required_order", maxInterveningBlocks: 0 },
      order: [block.id],
    },
    verified: true,
  };

  useAnnotationStore.setState({
    annotations: { [annotation.id]: annotation },
    focusedAnnotationId: null,
  });

  const dom = document.createElement("div");
  document.body.appendChild(dom);

  const maxPos = Math.max(1, state.doc.content.size - 1);
  const view = {
    state,
    dom,
    posAtCoords: ({ left }: { left: number }) => ({
      pos: Math.min(Math.max(Math.round(left ?? 1), 1), maxPos),
    }),
    dispatch: vi.fn(),
  } as unknown as EditorView;

  const plugin = createAnnotationPlugin({
    runtime,
    // biome-ignore lint/suspicious/noExplicitAny: mock function
    onFailClosed: onFailClosed as any,
    enableHandles: true,
  });
  const pluginView = plugin.spec.view?.(view) ?? null;

  const handle = document.createElement("span");
  handle.className = "lfcc-annotation-handle";
  handle.setAttribute("data-annotation-id", annotation.id);
  handle.setAttribute("data-handle", "end");
  dom.appendChild(handle);

  return { view, plugin, pluginView, handle, annotation, blockId: block.id };
};

const dispatchPointer = (target: EventTarget, type: string, clientX: number) => {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY: 0 });
  target.dispatchEvent(event);
};

const makeAnnotation = (blockId: string, id: string, start: number, end: number): Annotation => ({
  id,
  start: anchorFromAbsolute(blockId, start),
  end: anchorFromAbsolute(blockId, end),
  content: `anno:${id}`,
  storedState: "active",
  displayState: "active",
  createdAtMs: 0,
  spans: [{ blockId, start, end }],
  chain: {
    policy: { kind: "required_order", maxInterveningBlocks: 0 },
    order: [blockId],
  },
  verified: true,
});

const getDecorationKeys = (
  plugin: ReturnType<typeof createAnnotationPlugin>,
  state: EditorState
): string[] => {
  const decorations = plugin.props.decorations?.call(plugin, state) as DecorationSet | undefined;
  if (!decorations) {
    return [];
  }

  return decorations
    .find()
    .map((decoration) => decoration.spec.key)
    .filter((key): key is string => typeof key === "string")
    .sort((a, b) => a.localeCompare(b));
};

const hasFocusDecoration = (
  plugin: ReturnType<typeof createAnnotationPlugin>,
  state: EditorState
): boolean => {
  const decorations = plugin.props.decorations?.call(plugin, state) as DecorationSet | undefined;
  if (!decorations) {
    return false;
  }

  return decorations.find().some((decoration) => {
    const className = (decoration as { type?: { attrs?: { class?: string } } }).type?.attrs?.class;
    return typeof className === "string" && className.includes("lfcc-annotation--focus");
  });
};

describe("annotationPlugin drag throttling", () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
    stubRaf();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("uses the last pointermove when committing on drag end", () => {
    const { handle, pluginView, annotation, view } = setup();
    const updateSpy = vi
      .spyOn(annotationController, "updateAnnotationRangeFromSelection")
      .mockImplementation(() => ({
        ok: true,
        annotation: annotation,
      }));

    dispatchPointer(handle, "pointerdown", 2);
    expect(view.dom.classList.contains("lfcc-annotation-dragging")).toBe(true);
    dispatchPointer(window, "pointermove", 10);
    dispatchPointer(window, "pointermove", 20);

    expect(updateSpy).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(updateSpy).not.toHaveBeenCalled();

    dispatchPointer(window, "pointerup", 20);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const call = updateSpy.mock.calls[0]?.[0];
    expect(call.selection.to).toBe(20);

    pluginView?.destroy?.();
  });

  it("commits once on drag end and ignores later moves", () => {
    const { handle, pluginView, annotation, view } = setup();
    const updateSpy = vi
      .spyOn(annotationController, "updateAnnotationRangeFromSelection")
      .mockImplementation(() => ({
        ok: true,
        annotation: annotation,
      }));

    dispatchPointer(handle, "pointerdown", 2);
    expect(view.dom.classList.contains("lfcc-annotation-dragging")).toBe(true);
    dispatchPointer(window, "pointermove", 12);
    vi.runAllTimers();
    dispatchPointer(window, "pointerup", 12);
    dispatchPointer(window, "pointermove", 24);

    vi.runAllTimers();
    expect(updateSpy).toHaveBeenCalledTimes(1);

    pluginView?.destroy?.();
  });

  it("fails closed when the last move fails on drag end", () => {
    const failClosed = vi.fn();
    const { handle, pluginView, annotation, blockId, view } = setup(failClosed);
    const initialSpans = annotation.spans;

    const updateSpy = vi
      .spyOn(annotationController, "updateAnnotationRangeFromSelection")
      .mockImplementation((input) => {
        if (input.selection.to < 15) {
          annotationController.updateAnnotationRange({
            annotationId: annotation.id,
            spanList: [{ blockId, start: 1, end: 6 }],
            content: "updated",
          });
          return {
            ok: true,
            annotation: useAnnotationStore.getState().annotations[annotation.id],
          };
        }

        return {
          ok: false,
          error: "strict mapping failed",
          debugPayload: { to: input.selection.to },
        };
      });

    dispatchPointer(handle, "pointerdown", 2);
    expect(view.dom.classList.contains("lfcc-annotation-dragging")).toBe(true);
    dispatchPointer(window, "pointermove", 10);
    dispatchPointer(window, "pointermove", 22);

    vi.runAllTimers();
    dispatchPointer(window, "pointerup", 22);

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const call = updateSpy.mock.calls[0]?.[0];
    expect(call.selection.to).toBe(22);
    expect(useAnnotationStore.getState().annotations[annotation.id].spans).toEqual(initialSpans);
    expect(failClosed).toHaveBeenCalledTimes(1);

    pluginView?.destroy?.();
  });

  it("renders focus decorations for the focused annotation", () => {
    const { view, plugin, annotation } = setup();
    useAnnotationStore.getState().setFocusedAnnotationId(annotation.id);

    expect(hasFocusDecoration(plugin, view.state)).toBe(true);
  });

  it("clears focus when focused annotation is removed", () => {
    const { annotation } = setup();
    useAnnotationStore.getState().setFocusedAnnotationId(annotation.id);

    useAnnotationStore.getState().removeAnnotation(annotation.id);

    expect(useAnnotationStore.getState().focusedAnnotationId).toBeNull();
  });

  it("produces deterministic decoration keys regardless of insertion order", () => {
    const { view, plugin, blockId } = setup();
    const annoA = makeAnnotation(blockId, "anno-a", 0, 5);
    const annoB = makeAnnotation(blockId, "anno-b", 6, 11);

    useAnnotationStore.setState({
      annotations: { [annoA.id]: annoA, [annoB.id]: annoB },
      focusedAnnotationId: annoA.id,
    });
    const keysFirst = getDecorationKeys(plugin, view.state);

    useAnnotationStore.setState({
      annotations: { [annoB.id]: annoB, [annoA.id]: annoA },
      focusedAnnotationId: annoA.id,
    });
    const keysSecond = getDecorationKeys(plugin, view.state);

    expect(keysFirst).toEqual(keysSecond);
    expect(keysFirst.some((key) => key.startsWith("focus:"))).toBe(true);
  });

  it("clears focus when focused annotation becomes orphan", () => {
    const { view, pluginView, annotation } = setup();
    useAnnotationStore.getState().setFocusedAnnotationId(annotation.id);
    useAnnotationStore.getState().updateAnnotation(annotation.id, {
      displayState: "orphan",
    });

    pluginView?.update?.(view, view.state);

    expect(useAnnotationStore.getState().focusedAnnotationId).toBeNull();
  });

  it("keeps focus decoration for partial annotations", () => {
    const { view, plugin, annotation } = setup();
    useAnnotationStore.getState().updateAnnotation(annotation.id, {
      displayState: "active_partial",
    });
    useAnnotationStore.getState().setFocusedAnnotationId(annotation.id);

    expect(hasFocusDecoration(plugin, view.state)).toBe(true);
  });
});
