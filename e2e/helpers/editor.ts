import { type Page, expect } from "@playwright/test";

const DEFAULT_TIMEOUT = 25_000;
const FALLBACK_WORKER_INDEX = Math.random().toString(36).slice(2, 5);

type WaitOptions = {
  timeout?: number;
};

type LfccWindow = Window &
  typeof globalThis & {
    __lfccView?: import("prosemirror-view").EditorView;
    __lfccSetContent?: (text: string) => boolean;
  };

/**
 * Waits for the LFCC editor surface to be interactive.
 * - Ensures the ProseMirror node is visible.
 * - Waits for the bridge (window.__lfccView) when available.
 * - Throws with a short diagnostic on failure.
 */
export async function waitForEditorReady(page: Page, options: WaitOptions = {}): Promise<void> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  try {
    // Close any open dialogs that might block the editor
    const closeButton = page.getByRole("button", { name: "Close" });
    if (await closeButton.isVisible({ timeout: 500 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(100);
    }

    const editor = page.locator(".lfcc-editor .ProseMirror");
    await expect(editor).toBeVisible({ timeout });

    // If the LFCC bridge is present, wait for it to be set.
    await page.waitForFunction(
      () => typeof (window as unknown as Record<string, unknown>).__lfccView !== "undefined",
      undefined,
      { timeout }
    );

    // Final sanity: ensure we can read textContent without throwing.
    await page.waitForFunction(
      () => Boolean(document.querySelector(".lfcc-editor .ProseMirror")?.textContent !== null),
      undefined,
      { timeout }
    );
  } catch (error) {
    // Best-effort diagnostics to help understand why the editor isn't ready.
    const logs = await page
      .context()
      .storageState()
      .catch(() => undefined);
    const body = await page
      .evaluate(() => document.body?.innerText?.slice(0, 5000) ?? "<no-body>")
      .catch(() => "<body-read-failed>");

    throw new Error(
      `Editor did not become ready within ${timeout}ms\n` +
        `URL: ${page.url()}\n` +
        `State snapshot: ${logs ? "available" : "unavailable"}\n` +
        `Body preview:\n${body}\n` +
        `Underlying error: ${(error as Error).message}`
    );
  }
}

export async function selectFirstTextRange(page: Page, maxChars = 12): Promise<void> {
  await page.evaluate((limit) => {
    const root = document.querySelector(".lfcc-editor .ProseMirror");
    if (!root) {
      throw new Error("Editor not found");
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let textNode: Text | null = null;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.textContent && node.textContent.trim().length > 0) {
        textNode = node;
        break;
      }
    }

    if (!textNode) {
      throw new Error("Text node not found");
    }

    const text = textNode.textContent ?? "";
    const endOffset = Math.min(limit, text.length);
    if (endOffset === 0) {
      return;
    }

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, endOffset);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    const lfccWindow = window as unknown as LfccWindow & {
      pmTextSelection?: {
        create?: (doc: import("prosemirror-model").Node, fromPos: number, toPos: number) => unknown;
      };
    };
    const view = lfccWindow.__lfccView;
    if (view?.state?.doc) {
      try {
        const fromPos = view.posAtDOM(textNode, 0);
        const toPos = view.posAtDOM(textNode, endOffset);
        const SelectionCtor = (lfccWindow.pmTextSelection ?? view.state.selection?.constructor) as {
          create?: (
            doc: import("prosemirror-model").Node,
            fromPos: number,
            toPos: number
          ) => unknown;
        };
        if (SelectionCtor?.create) {
          const pmSelection = SelectionCtor.create(view.state.doc, fromPos, toPos);
          view.dispatch(view.state.tr.setSelection(pmSelection));
        }
      } catch {
        // Ignore - DOM selection remains for toolbar interactions
      }
      view.focus();
    }
  }, maxChars);
}

async function waitForSelectionInEditor(
  page: Page,
  timeout = 2000,
  requireBlockId = true
): Promise<void> {
  await page.waitForFunction(
    (needsBlockId) => {
      const root = document.querySelector(".lfcc-editor .ProseMirror");
      if (!root) {
        return false;
      }

      const selection = window.getSelection();
      const hasDomSelection = (() => {
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
          return false;
        }
        const { anchorNode, focusNode } = selection;
        if (!anchorNode || !focusNode) {
          return false;
        }
        return root.contains(anchorNode) && root.contains(focusNode);
      })();

      const view = (window as unknown as { __lfccView?: import("prosemirror-view").EditorView })
        .__lfccView;
      const pmSelection = view?.state?.selection as { from?: number; to?: number } | undefined;
      const hasPmSelection =
        typeof pmSelection?.from === "number" &&
        typeof pmSelection?.to === "number" &&
        pmSelection.from !== pmSelection.to;

      if (!hasDomSelection && !hasPmSelection) {
        return false;
      }
      if (!needsBlockId) {
        return true;
      }

      const findParentBlock = (node: Node | null) => {
        let current: Node | null = node;
        while (current) {
          if (current instanceof HTMLElement && current.hasAttribute("data-block-id")) {
            return current;
          }
          current = current.parentNode;
        }
        return null;
      };

      if (hasDomSelection && selection) {
        const range = selection.getRangeAt(0);
        const startBlock = findParentBlock(range.startContainer);
        const endBlock = findParentBlock(range.endContainer);
        if (startBlock && endBlock) {
          return true;
        }
      }

      if (hasPmSelection && view?.domAtPos) {
        try {
          const fromDom = view.domAtPos(pmSelection?.from ?? 0);
          const toDom = view.domAtPos(pmSelection?.to ?? 0);
          const startBlock = findParentBlock(fromDom.node);
          const endBlock = findParentBlock(toDom.node);
          return Boolean(startBlock && endBlock);
        } catch {
          return false;
        }
      }

      return false;
    },
    requireBlockId,
    { timeout }
  );
}

export async function selectTextBySubstring(page: Page, needle: string): Promise<string> {
  await page.waitForSelector(".lfcc-editor [data-block-id]", { timeout: 2000 });
  const performSelection = async () =>
    page.evaluate((target) => {
      const lfccWindow = window as unknown as LfccWindow & {
        pmTextSelection?: {
          create?: (
            doc: import("prosemirror-model").Node,
            fromPos: number,
            toPos: number
          ) => unknown;
        };
      };
      const view = lfccWindow.__lfccView;

      const selectViaProseMirror = () => {
        if (!view?.state?.doc) {
          return null;
        }
        let fromPos: number | null = null;
        view.state.doc.descendants((node, pos) => {
          if (!node.isText) {
            return true;
          }
          const text = node.text ?? "";
          const index = text.indexOf(target);
          if (index !== -1) {
            fromPos = pos + index;
            return false;
          }
          return true;
        });
        if (fromPos === null) {
          return null;
        }
        const toPos = fromPos + target.length;
        try {
          const SelectionCtor = (lfccWindow.pmTextSelection ??
            view.state.selection?.constructor) as {
            create?: (
              doc: import("prosemirror-model").Node,
              fromPos: number,
              toPos: number
            ) => unknown;
          };
          if (SelectionCtor?.create) {
            const selection = SelectionCtor.create(view.state.doc, fromPos, toPos);
            view.dispatch(view.state.tr.setSelection(selection));
          }
          const fromDom = view.domAtPos(fromPos);
          const toDom = view.domAtPos(toPos);
          const range = document.createRange();
          range.setStart(fromDom.node, fromDom.offset);
          range.setEnd(toDom.node, toDom.offset);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          document.dispatchEvent(new Event("selectionchange"));
          document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          view.focus();
        } catch {
          return null;
        }
        return window.getSelection()?.toString() ?? target;
      };

      const selectViaDom = () => {
        const root = document.querySelector(".lfcc-editor .ProseMirror");
        if (!root) {
          throw new Error("Editor not found");
        }

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        let textNode: Text | null = null;
        let offsetInNode = -1;

        while (walker.nextNode()) {
          const node = walker.currentNode as Text;
          const text = node.textContent || "";
          const index = text.indexOf(target);

          if (index !== -1) {
            textNode = node;
            offsetInNode = index;
            break;
          }
        }

        if (!textNode || offsetInNode === -1) {
          throw new Error(`Text not found: "${target}"`);
        }

        const range = document.createRange();
        range.setStart(textNode, offsetInNode);
        range.setEnd(textNode, offsetInNode + target.length);

        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
        document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

        if (view?.state?.doc) {
          try {
            const fromPos = view.posAtDOM(textNode, offsetInNode);
            const toPos = view.posAtDOM(textNode, offsetInNode + target.length);
            const SelectionCtor = (lfccWindow.pmTextSelection ??
              view.state.selection?.constructor) as {
              create?: (
                doc: import("prosemirror-model").Node,
                fromPos: number,
                toPos: number
              ) => unknown;
            };
            if (SelectionCtor?.create) {
              const selection = SelectionCtor.create(view.state.doc, fromPos, toPos);
              view.dispatch(view.state.tr.setSelection(selection));
            }
          } catch {
            // Ignore - fallback to DOM selection only
          }
          view.focus();
        }

        return window.getSelection()?.toString() ?? target;
      };

      const pmSelectionText = selectViaProseMirror();
      if (pmSelectionText !== null) {
        return pmSelectionText;
      }
      return selectViaDom();
    }, needle);

  let selectedText = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    selectedText = await performSelection();
    try {
      await waitForSelectionInEditor(page, 2000, false);
      return selectedText;
    } catch {
      await page.waitForTimeout(50);
    }
  }

  throw new Error(`Failed to set selection for "${needle}"`);
}

export async function selectRangeBetweenSubstrings(
  page: Page,
  startNeedle: string,
  endNeedle: string
): Promise<string> {
  await page.waitForSelector(".lfcc-editor [data-block-id]", { timeout: 2000 });
  const performSelection = async () =>
    page.evaluate(
      ({ startNeedle: startToken, endNeedle: endToken }) => {
        const lfccWindow = window as unknown as {
          __lfccView?: import("prosemirror-view").EditorView;
          pmTextSelection?: {
            create?: (
              doc: import("prosemirror-model").Node,
              fromPos: number,
              toPos: number
            ) => unknown;
          };
        };
        const view = lfccWindow.__lfccView;

        const selectViaProseMirror = () => {
          if (!view?.state?.doc) {
            return null;
          }
          const findInDoc = (needle: string) => {
            let result: { pos: number; length: number } | null = null;
            view.state.doc.descendants((node, pos) => {
              if (!node.isText) {
                return true;
              }
              const text = node.text ?? "";
              const index = text.indexOf(needle);
              if (index !== -1) {
                result = { pos: pos + index, length: needle.length };
                return false;
              }
              return true;
            });
            return result;
          };

          const start = findInDoc(startToken);
          const end = findInDoc(endToken);
          if (!start || !end) {
            return null;
          }
          const fromPos = start.pos;
          const toPos = end.pos + end.length;
          if (fromPos >= toPos) {
            return null;
          }

          try {
            const SelectionCtor = (lfccWindow.pmTextSelection ??
              view.state.selection?.constructor) as {
              create?: (
                doc: import("prosemirror-model").Node,
                fromPos: number,
                toPos: number
              ) => unknown;
            };
            if (SelectionCtor?.create) {
              const pmSelection = SelectionCtor.create(view.state.doc, fromPos, toPos);
              view.dispatch(view.state.tr.setSelection(pmSelection));
            }
            const fromDom = view.domAtPos(fromPos);
            const toDom = view.domAtPos(toPos);
            const range = document.createRange();
            range.setStart(fromDom.node, fromDom.offset);
            range.setEnd(toDom.node, toDom.offset);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
            document.dispatchEvent(new Event("selectionchange"));
            document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          } catch {
            return null;
          }
          view.focus();
          const selection = window.getSelection();
          return selection?.toString() ?? "";
        };

        const selectViaDom = () => {
          const root = document.querySelector(".lfcc-editor .ProseMirror");
          if (!root) {
            throw new Error("Editor not found");
          }

          const findNode = (needle: string) => {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let node = walker.nextNode() as Text | null;
            while (node) {
              const text = node.textContent ?? "";
              const index = text.indexOf(needle);
              if (index !== -1) {
                return { node, index, length: needle.length };
              }
              node = walker.nextNode() as Text | null;
            }
            return null;
          };

          const start = findNode(startToken);
          const end = findNode(endToken);
          if (!start || !end) {
            throw new Error(`Missing range for \"${startToken}\" -> \"${endToken}\"`);
          }

          const range = document.createRange();
          range.setStart(start.node, start.index);
          range.setEnd(end.node, end.index + end.length);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          document.dispatchEvent(new Event("selectionchange"));
          document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

          if (view?.state?.doc) {
            try {
              const fromPos = view.posAtDOM(start.node, start.index);
              const toPos = view.posAtDOM(end.node, end.index + end.length);
              const SelectionCtor = (lfccWindow.pmTextSelection ??
                view.state.selection?.constructor) as {
                create?: (
                  doc: import("prosemirror-model").Node,
                  fromPos: number,
                  toPos: number
                ) => unknown;
              };
              if (SelectionCtor?.create) {
                const pmSelection = SelectionCtor.create(view.state.doc, fromPos, toPos);
                view.dispatch(view.state.tr.setSelection(pmSelection));
              }
            } catch {
              // Ignore - DOM selection is still set for toolbar interactions
            }
            view.focus();
          }

          return selection?.toString() ?? "";
        };

        const pmSelectionText = selectViaProseMirror();
        if (pmSelectionText !== null) {
          return pmSelectionText;
        }
        return selectViaDom();
      },
      { startNeedle, endNeedle }
    );

  let selectedText = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    selectedText = await performSelection();
    try {
      await waitForSelectionInEditor(page, 2000, false);
      return selectedText;
    } catch {
      await page.waitForTimeout(50);
    }
  }

  const editor = page.locator(".lfcc-editor .ProseMirror");
  const startNode = editor.getByText(startNeedle, { exact: false }).first();
  const endNode = editor.getByText(endNeedle, { exact: false }).first();
  await startNode.scrollIntoViewIfNeeded();
  await startNode.click({ position: { x: 2, y: 2 } });
  await endNode.scrollIntoViewIfNeeded();
  await endNode.click({ modifiers: ["Shift"] });
  try {
    await waitForSelectionInEditor(page, 2000, false);
    selectedText = await page.evaluate(() => window.getSelection()?.toString() ?? "");
    return selectedText;
  } catch {
    // fall through to error
  }

  throw new Error(`Failed to set selection for \"${startNeedle}\" -> \"${endNeedle}\"`);
}

export async function getAnnotationIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    // Try overlay-mode selector first, fall back to legacy
    const overlaySelector = ".highlight-overlay .highlight-rect[data-annotation-id]";
    const targetSelector = ".lfcc-editor .lfcc-annotation-target[data-annotation-id]";
    const legacySelector = ".lfcc-editor .lfcc-annotation[data-annotation-id]";

    let nodes = document.querySelectorAll<HTMLElement>(overlaySelector);
    if (nodes.length === 0) {
      nodes = document.querySelectorAll<HTMLElement>(targetSelector);
    }
    if (nodes.length === 0) {
      nodes = document.querySelectorAll<HTMLElement>(legacySelector);
    }

    const ids: string[] = [];
    for (const node of nodes) {
      const id = node.getAttribute("data-annotation-id");
      if (id) {
        ids.push(id);
      }
    }
    return Array.from(new Set(ids));
  });
}

export async function createAnnotationFromSelection(page: Page, color = "yellow"): Promise<string> {
  await waitForSelectionInEditor(page, 2000, false);
  const idsBefore = await getAnnotationIds(page);

  await page.evaluate((nextColor) => {
    window.dispatchEvent(
      new CustomEvent("lfcc-create-annotation", {
        detail: { color: nextColor },
      })
    );
  }, color);

  await expect
    .poll(async () => (await getAnnotationIds(page)).length, { timeout: 5000 })
    .toBeGreaterThan(idsBefore.length);

  const idsAfter = await getAnnotationIds(page);
  const newId = idsAfter.find((id) => !idsBefore.includes(id));
  if (!newId) {
    throw new Error("Failed to create annotation");
  }
  return newId;
}

export async function getAnnotationTextById(page: Page, annotationId: string): Promise<string> {
  return await page.evaluate((id) => {
    // Try overlay-mode selectors, fall back to legacy
    // For text content, we need to check the editor DOM (target layer) not overlay
    const targetSelector = `.lfcc-editor .lfcc-annotation-target[data-annotation-id="${id}"]`;
    const legacySelector = `.lfcc-editor .lfcc-annotation[data-annotation-id="${id}"]`;

    let nodes = document.querySelectorAll<HTMLElement>(targetSelector);
    if (nodes.length === 0) {
      nodes = document.querySelectorAll<HTMLElement>(legacySelector);
    }
    if (!nodes.length) {
      return "";
    }
    return Array.from(nodes)
      .map((node) => node.textContent ?? "")
      .join("");
  }, annotationId);
}

type LfccDocInfo = {
  childCount: number;
  firstBlockType: string | null;
  selectionBlockType: string | null;
};

export async function getDocInfo(page: Page): Promise<LfccDocInfo> {
  return await page.evaluate(() => {
    const view = (window as unknown as Record<string, unknown>).__lfccView as
      | {
          state?: {
            selection?: { $from?: { parent?: { type?: { name?: string } } } };
            doc?: {
              childCount?: number;
              firstChild?: { type?: { name?: string } };
            };
          };
        }
      | undefined;
    const doc = view?.state?.doc;
    const selectionParent = view?.state?.selection?.$from?.parent;
    return {
      childCount: doc?.childCount ?? 0,
      firstBlockType: doc?.firstChild?.type?.name ?? null,
      selectionBlockType: selectionParent?.type?.name ?? null,
    };
  });
}

// ... (existing imports and wait function)

export const modKey = process.platform === "darwin" ? "Meta" : "Control";

export async function dismissNextJsOverlay(page: Page): Promise<void> {
  // Dismiss Next.js dev overlay if present
  const overlay = page.locator("nextjs-portal");
  if ((await overlay.count()) > 0) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  }
}

export async function focusEditor(page: Page): Promise<void> {
  await dismissNextJsOverlay(page);
  const focusResult = await page.evaluate(() => {
    const view = (window as unknown as { __lfccView?: import("prosemirror-view").EditorView })
      .__lfccView;
    if (!view) {
      return { focused: false };
    }
    const active = document.activeElement;
    const alreadyFocused =
      active === view.dom || (active instanceof Node && view.dom.contains(active));
    if (alreadyFocused) {
      return {
        focused: true,
        alreadyFocused: true,
        prevFrom: view.state.selection.from,
        prevTo: view.state.selection.to,
      };
    }
    const prevSelection = view.state.selection;
    const prevFrom = prevSelection.from;
    const prevTo = prevSelection.to;
    view.focus();
    const nextActive = document.activeElement;
    const isFocused =
      nextActive === view.dom || (nextActive instanceof Node && view.dom.contains(nextActive));
    return { focused: isFocused, alreadyFocused: false, prevFrom, prevTo };
  });

  if (focusResult.focused && !focusResult.alreadyFocused) {
    await page.waitForTimeout(50);
    await page.evaluate(({ prevFrom, prevTo }) => {
      const globalAny = window as unknown as {
        __lfccView?: import("prosemirror-view").EditorView;
        pmTextSelection?: {
          create?: (
            docNode: import("prosemirror-model").Node,
            fromPos: number,
            toPos: number
          ) => unknown;
          near?: (resolved: import("prosemirror-model").ResolvedPos, bias?: number) => unknown;
        };
      };
      const view = globalAny.__lfccView;
      if (!view) {
        return;
      }
      const selectionCtor = globalAny.pmTextSelection ?? view.state.selection?.constructor;
      if (!selectionCtor) {
        return;
      }
      const current = view.state.selection;
      const docEnd = view.state.doc.content.size;
      const isFullDoc = current.from === 0 && current.to === docEnd;

      // Clamp target positions to valid document bounds
      // This prevents errors after undo/redo when document shrinks
      const clamp = (pos: number) => Math.min(Math.max(1, pos), docEnd);
      const targetFrom = isFullDoc ? clamp(prevTo) : clamp(prevFrom);
      const targetTo = isFullDoc ? clamp(prevTo) : clamp(prevTo);

      if (selectionCtor?.create) {
        try {
          view.dispatch(
            view.state.tr.setSelection(selectionCtor.create(view.state.doc, targetFrom, targetTo))
          );
        } catch {
          // If position is still invalid, use Selection.near as fallback
          if (selectionCtor?.near) {
            const $pos = view.state.doc.resolve(Math.min(1, docEnd));
            view.dispatch(view.state.tr.setSelection(selectionCtor.near($pos, 1)));
          }
        }
      } else if (selectionCtor?.near && targetFrom === targetTo) {
        view.dispatch(
          view.state.tr.setSelection(selectionCtor.near(view.state.doc.resolve(targetFrom), 1))
        );
      }
    }, focusResult);
    return;
  }

  const clickPoint = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>(".lfcc-editor .ProseMirror");
    if (!editor) {
      return null;
    }

    const rect = editor.getBoundingClientRect();
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    const candidates = [
      {
        x: rect.left + Math.min(32, rect.width * 0.2),
        y: rect.top + clamp(rect.height * 0.5, 80, rect.height - 24),
      },
      {
        x: rect.left + Math.min(48, rect.width * 0.3),
        y: rect.top + clamp(rect.height * 0.4, 64, rect.height - 24),
      },
      {
        x: rect.left + Math.min(48, rect.width * 0.3),
        y: rect.top + Math.max(24, rect.height - 48),
      },
    ];

    for (const point of candidates) {
      const el = document.elementFromPoint(point.x, point.y);
      if (el && (el === editor || editor.contains(el))) {
        return point;
      }
    }

    const stepX = Math.max(30, rect.width / 5);
    const stepY = Math.max(30, rect.height / 5);
    for (let y = rect.top + stepY; y <= rect.bottom - stepY; y += stepY) {
      for (let x = rect.left + stepX; x <= rect.right - stepX; x += stepX) {
        const el = document.elementFromPoint(x, y);
        if (el && (el === editor || editor.contains(el))) {
          return { x, y };
        }
      }
    }

    return null;
  });

  if (clickPoint) {
    const prevSelection = await page.evaluate(() => {
      const view = (window as unknown as { __lfccView?: import("prosemirror-view").EditorView })
        .__lfccView;
      if (!view) {
        return null;
      }
      return { from: view.state.selection.from, to: view.state.selection.to };
    });
    await page.mouse.click(clickPoint.x, clickPoint.y);
    if (prevSelection) {
      await page.waitForTimeout(50);
      await page.evaluate(({ from, to }) => {
        const globalAny = window as unknown as {
          __lfccView?: import("prosemirror-view").EditorView;
          pmTextSelection?: {
            create?: (
              docNode: import("prosemirror-model").Node,
              fromPos: number,
              toPos: number
            ) => unknown;
            near?: (resolved: import("prosemirror-model").ResolvedPos, bias?: number) => unknown;
          };
        };
        const view = globalAny.__lfccView;
        if (!view) {
          return;
        }
        const selectionCtor = globalAny.pmTextSelection ?? view.state.selection?.constructor;
        if (!selectionCtor) {
          return;
        }
        const current = view.state.selection;
        const docEnd = view.state.doc.content.size;
        const isFullDoc = current.from === 0 && current.to === docEnd;
        const targetFrom = isFullDoc ? to : from;
        const targetTo = isFullDoc ? to : to;
        if (selectionCtor?.create) {
          view.dispatch(
            view.state.tr.setSelection(selectionCtor.create(view.state.doc, targetFrom, targetTo))
          );
        } else if (selectionCtor?.near && targetFrom === targetTo) {
          view.dispatch(
            view.state.tr.setSelection(selectionCtor.near(view.state.doc.resolve(targetFrom), 1))
          );
        }
      }, prevSelection);
    }
    return;
  }

  const editor = page.locator(".lfcc-editor .ProseMirror");
  const prevSelection = await page.evaluate(() => {
    const view = (window as unknown as { __lfccView?: import("prosemirror-view").EditorView })
      .__lfccView;
    if (!view) {
      return null;
    }
    return { from: view.state.selection.from, to: view.state.selection.to };
  });
  await editor.click({ force: true });
  if (prevSelection) {
    await page.waitForTimeout(50);
    await page.evaluate(({ from, to }) => {
      const globalAny = window as unknown as {
        __lfccView?: import("prosemirror-view").EditorView;
        pmTextSelection?: {
          create?: (
            docNode: import("prosemirror-model").Node,
            fromPos: number,
            toPos: number
          ) => unknown;
          near?: (resolved: import("prosemirror-model").ResolvedPos, bias?: number) => unknown;
        };
      };
      const view = globalAny.__lfccView;
      if (!view) {
        return;
      }
      const selectionCtor = globalAny.pmTextSelection ?? view.state.selection?.constructor;
      if (!selectionCtor) {
        return;
      }
      const current = view.state.selection;
      const docEnd = view.state.doc.content.size;
      const isFullDoc = current.from === 0 && current.to === docEnd;
      const targetFrom = isFullDoc ? to : from;
      const targetTo = isFullDoc ? to : to;
      if (selectionCtor?.create) {
        view.dispatch(
          view.state.tr.setSelection(selectionCtor.create(view.state.doc, targetFrom, targetTo))
        );
      } else if (selectionCtor?.near && targetFrom === targetTo) {
        view.dispatch(
          view.state.tr.setSelection(selectionCtor.near(view.state.doc.resolve(targetFrom), 1))
        );
      }
    }, prevSelection);
  }
}

export async function clearEditorContent(page: Page): Promise<void> {
  // Try the controlled dispatch hook first (fixes state desync in controlled mode)
  const cleared = await page.evaluate(() => {
    const globalAny = window as unknown as {
      __lfccClearContent?: () => boolean;
      __lfccView?: {
        state: {
          doc: { content: { size: number } };
          tr: { replaceWith: (from: number, to: number, node: unknown) => unknown };
          schema: {
            nodes: {
              doc?: { create: (attrs: null, content?: unknown) => unknown };
              paragraph?: { create: (attrs: null, content?: unknown) => unknown };
            };
          };
        };
        dispatch: (tr: unknown) => void;
        focus: () => void;
      };
    };

    // Prefer controlled dispatch hook
    if (globalAny.__lfccClearContent) {
      return globalAny.__lfccClearContent();
    }

    // Fallback to direct view manipulation (legacy path)
    const view = globalAny.__lfccView;
    if (!view) {
      return false;
    }

    const { state } = view;
    const { paragraph, doc: docNode } = state.schema.nodes;

    if (!paragraph) {
      return false;
    }

    const paragraphNode = paragraph.create(null, []);
    const nextDoc = docNode?.create(null, [paragraphNode]) ?? paragraphNode;
    const tr = state.tr.replaceWith(0, state.doc.content.size, nextDoc);
    view.dispatch(tr);
    view.focus();
    return true;
  });

  if (!cleared) {
    // If strict PM manipulation fails, try fallback: select all and delete
    const editor = page.locator(".lfcc-editor .ProseMirror");
    if (await editor.isVisible()) {
      await focusEditor(page);
      await page.keyboard.press(`${modKey}+a`);
      await page.keyboard.press("Backspace");
      return;
    }
    throw new Error("Failed to clear editor content");
  }

  // Wait for clear
  await expect
    .poll(
      async () => {
        const text = await page.evaluate(
          () => document.querySelector(".lfcc-editor .ProseMirror")?.textContent?.trim() ?? ""
        );
        return text === "";
      },
      { timeout: 2000 }
    )
    .toBe(true);
}

export async function typeInEditor(page: Page, text: string, delay = 5): Promise<void> {
  await focusEditor(page);
  await page.keyboard.type(text, { delay });
  // Wait to ensure prosemirror-history creates a distinct undo step usually
  await page.waitForTimeout(100);
}

export async function setEditorContent(page: Page, text: string): Promise<void> {
  await dismissNextJsOverlay(page);
  // Try the controlled dispatch hook first (fixes state desync in controlled mode)
  const success = await page.evaluate((content) => {
    const globalAny = window as unknown as {
      __lfccSetContent?: (text: string) => boolean;
      __lfccView?: {
        state: {
          doc: { content: { size: number } };
          tr: {
            replaceWith: (
              from: number,
              to: number,
              node: import("prosemirror-model").Node
            ) => import("prosemirror-state").Transaction;
          };
          schema: {
            text: (text: string) => import("prosemirror-model").Node;
            nodes: {
              doc: {
                create: (
                  attrs: null,
                  content: import("prosemirror-model").Node[]
                ) => import("prosemirror-model").Node;
              };
              paragraph: {
                create: (
                  attrs: null,
                  content: import("prosemirror-model").Node[]
                ) => import("prosemirror-model").Node;
              };
            };
          };
        };
        dispatch: (tr: unknown) => void;
        focus: () => void;
      };
    };

    // Prefer controlled dispatch hook
    if (globalAny.__lfccSetContent) {
      return globalAny.__lfccSetContent(content);
    }

    // Fallback to direct view manipulation (legacy path)
    const view = globalAny.__lfccView;
    if (!view) {
      return false;
    }

    const { state } = view;
    const { schema } = state;

    const textNode = schema.text(content);
    const paragraphNode = schema.nodes.paragraph.create(null, [textNode]);
    const docNode = schema.nodes.doc.create(null, [paragraphNode]);

    const tr = state.tr.replaceWith(0, state.doc.content.size, docNode);
    view.dispatch(tr);
    view.focus();
    return true;
  }, text);

  if (!success) {
    // Fallback if bridge unavailable
    await clearEditorContent(page);
    await page.waitForTimeout(50);
    await page.keyboard.type(text, { delay: 10 });
    return;
  }

  await page.evaluate(() => {
    const globalAny = window as unknown as {
      __lfccView?: import("prosemirror-view").EditorView;
      pmTextSelection?: {
        create?: (
          docNode: import("prosemirror-model").Node,
          fromPos: number,
          toPos: number
        ) => unknown;
      };
    };
    const view = globalAny.__lfccView;
    if (!view?.state?.doc) {
      return;
    }
    const { doc, selection } = view.state;
    const SelectionCtor = (globalAny.pmTextSelection ?? selection?.constructor) as {
      create?: (
        docNode: import("prosemirror-model").Node,
        fromPos: number,
        toPos: number
      ) => unknown;
    };
    if (!SelectionCtor?.create) {
      return;
    }
    let endPos: number | null = null;
    doc.descendants((node, pos) => {
      if (!node.isTextblock) {
        return true;
      }
      const contentEnd = pos + 1 + node.content.size;
      endPos = contentEnd;
      return true;
    });
    if (endPos === null) {
      return;
    }
    const nextSelection = SelectionCtor.create(doc, endPos, endPos);
    view.dispatch(view.state.tr.setSelection(nextSelection));
    view.focus();
  });

  await collapseSelection(page);
}

export async function getEditorText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const editor = document.querySelector(".lfcc-editor .ProseMirror");
    return editor?.textContent ?? "";
  });
}

export async function getEditorHTML(page: Page): Promise<string> {
  return page.locator(".lfcc-editor .ProseMirror").innerHTML();
}

/**
 * Creates a unique document ID for test isolation.
 * This ensures each test runs with a fresh document, avoiding persisted content conflicts.
 */
export function createTestDocId(prefix = "test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Opens a fresh editor with a unique document ID.
 * This is the recommended way to start each E2E test for proper isolation.
 *
 * @param page - Playwright page
 * @param testName - Name of the test (used to create meaningful doc ID)
 * @param options - Additional options
 * @returns Object with the unique doc ID used
 */
export async function openFreshEditor(
  page: Page,
  testName: string,
  options: { clearContent?: boolean } = {}
): Promise<{ docId: string }> {
  const docId = createTestDocId(testName.replace(/[^a-z0-9]/gi, "-").toLowerCase());

  // Support unique DB name per Playwright worker to prevent state conflicts
  // Fallback to random ID if parallel index is somehow unavailable
  const workerIndex = process.env.PLAYWRIGHT_WORKER_INDEX ?? FALLBACK_WORKER_INDEX;
  const dbName = `reader-db-worker-${workerIndex}`;

  // Log to terminal for debugging (use warn to ensure it shows)
  console.warn(`[E2E] Opening editor for doc: ${docId}, db: ${dbName}, worker: ${workerIndex}`);

  // Disable default demo seeding in tests to avoid content races
  const url = `/editor?doc=${docId}&db=${dbName}&seed=0`;

  await page.goto(url);
  await waitForEditorReady(page);

  // Give DB and Loro runtime a moment to settle with the new unique name and doc ID
  await page.waitForTimeout(1000);

  if (options.clearContent !== false) {
    await clearEditorContent(page);
    await page.waitForTimeout(300);
  }

  return { docId };
}

/**
 * Select all text in the editor using keyboard Cmd/Ctrl+A.
 * Waits for content before attempting selection.
 */
export async function selectAllText(page: Page): Promise<void> {
  // First ensure there's content to select
  const hasContent = await page
    .evaluate(() => {
      const editor = document.querySelector(".lfcc-editor .ProseMirror");
      return (editor?.textContent?.trim() ?? "").length > 0;
    })
    .catch(async (error) => {
      if (error instanceof Error && error.message.includes("Execution context was destroyed")) {
        await page.waitForLoadState("domcontentloaded");
        return await page.evaluate(() => {
          const editor = document.querySelector(".lfcc-editor .ProseMirror");
          return (editor?.textContent?.trim() ?? "").length > 0;
        });
      }
      throw error;
    });

  if (!hasContent) {
    // If no content, nothing to select
    return;
  }

  await focusEditor(page);

  const viewSelected = await page.evaluate(() => {
    const globalAny = window as unknown as {
      __lfccView?: import("prosemirror-view").EditorView;
      pmTextSelection?: {
        create?: (
          docNode: import("prosemirror-model").Node,
          fromPos: number,
          toPos: number
        ) => unknown;
      };
    };
    const view = globalAny.__lfccView;
    if (!view?.state?.doc) {
      return false;
    }
    const { doc } = view.state;
    let from: number | null = null;
    let to: number | null = null;

    doc.descendants((node, pos) => {
      if (!node.isText || !node.text) {
        return true;
      }
      if (from === null) {
        from = pos;
      }
      to = pos + node.text.length;
      return true;
    });

    if (from === null || to === null || to <= from) {
      return false;
    }

    const SelectionCtor = (globalAny.pmTextSelection ?? view.state.selection?.constructor) as {
      create?: (
        docNode: import("prosemirror-model").Node,
        fromPos: number,
        toPos: number
      ) => unknown;
    };
    if (!SelectionCtor?.create) {
      return false;
    }
    const selection = SelectionCtor.create(doc, from, to);
    view.dispatch(view.state.tr.setSelection(selection));
    view.focus();
    return true;
  });

  if (!viewSelected) {
    // Use keyboard to select all
    await page.keyboard.press(`${modKey}+a`);
  }

  const domSelected = await page.evaluate(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      return true;
    }

    const root = document.querySelector(".lfcc-editor .ProseMirror");
    if (!root) {
      return false;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let firstNode: Text | null = null;
    let lastNode: Text | null = null;

    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.textContent && node.textContent.trim().length > 0) {
        if (!firstNode) {
          firstNode = node;
        }
        lastNode = node;
      }
    }

    if (!firstNode || !lastNode) {
      return false;
    }

    const range = document.createRange();
    range.setStart(firstNode, 0);
    range.setEnd(lastNode, lastNode.textContent?.length ?? 0);

    const domSelection = window.getSelection();
    domSelection?.removeAllRanges();
    domSelection?.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    return (domSelection?.toString().trim().length ?? 0) > 0;
  });

  if (!domSelected) {
    // Wait briefly for selection to update if it was set asynchronously.
    await page
      .waitForFunction(
        () => {
          const sel = window.getSelection();
          return sel && sel.toString().trim().length > 0;
        },
        { timeout: 3000 }
      )
      .catch(() => {
        // Keep silent: callers can assert selection if required.
      });
  }

  await page.evaluate(() => {
    document.dispatchEvent(new Event("selectionchange"));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });

  await page.waitForTimeout(100);
}

export async function collapseSelection(page: Page): Promise<void> {
  const collapsed = await page.evaluate(() => {
    const globalAny = window as unknown as {
      __lfccView?: import("prosemirror-view").EditorView;
      pmTextSelection?: {
        create?: (
          docNode: import("prosemirror-model").Node,
          fromPos: number,
          toPos: number
        ) => unknown;
      };
    };
    const view = globalAny.__lfccView;
    if (!view?.state?.doc) {
      return false;
    }
    const { doc, selection } = view.state;
    const pos = selection.to;
    const SelectionCtor = (globalAny.pmTextSelection ?? selection?.constructor) as {
      create?: (
        docNode: import("prosemirror-model").Node,
        fromPos: number,
        toPos: number
      ) => unknown;
    };
    if (!SelectionCtor?.create) {
      return false;
    }
    const nextSelection = SelectionCtor.create(doc, pos, pos);
    view.dispatch(view.state.tr.setSelection(nextSelection));
    view.focus();
    return true;
  });

  if (!collapsed) {
    await page.keyboard.press("ArrowRight");
  }
}

type ClickPoint = { x: number; y: number };

export async function getPointForSubstring(
  page: Page,
  needle: string,
  options: { preferEnd?: boolean } = {}
): Promise<ClickPoint | null> {
  return await page.evaluate(
    ({ target, preferEnd }) => {
      const root = document.querySelector<HTMLElement>(".lfcc-editor .ProseMirror");
      if (!root) {
        return null;
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text | null;
      while (node) {
        const text = node.textContent ?? "";
        const index = text.indexOf(target);
        if (index !== -1) {
          const start = index;
          const end = index + target.length;
          const step = preferEnd ? -1 : 1;
          let offset = preferEnd ? end - 1 : start;

          const clampPoint = (rect: DOMRect) => {
            const x = rect.left + Math.min(4, Math.max(2, rect.width / 2));
            const y = rect.top + rect.height / 2;
            return { x, y };
          };

          while (offset >= start && offset < end) {
            const range = document.createRange();
            range.setStart(node, offset);
            range.setEnd(node, Math.min(offset + 1, text.length));
            const rect = range.getBoundingClientRect();
            if (rect.width > 0 || rect.height > 0) {
              const point = clampPoint(rect);
              const hit = document.elementFromPoint(point.x, point.y);
              if (hit && (hit === root || root.contains(hit))) {
                return point;
              }
            }
            offset += step;
          }

          const fallbackRange = document.createRange();
          fallbackRange.setStart(node, start);
          fallbackRange.setEnd(node, Math.min(start + 1, text.length));
          const fallbackRect = fallbackRange.getBoundingClientRect();
          if (fallbackRect.width === 0 && fallbackRect.height === 0) {
            return null;
          }
          return clampPoint(fallbackRect);
        }
        node = walker.nextNode() as Text | null;
      }
      return null;
    },
    { target: needle, preferEnd: options.preferEnd ?? false }
  );
}

/**
 * Wait for an annotation to appear in the editor.
 * Supports both overlay mode (.highlight-rect) and legacy mode (.lfcc-annotation).
 */
export async function waitForAnnotation(page: Page, timeout = 5000): Promise<void> {
  const selector = ".highlight-overlay .highlight-rect, .lfcc-annotation";
  await page.locator(selector).first().waitFor({ state: "visible", timeout });
}

/**
 * Get the annotation selector that works with both overlay and legacy modes.
 */
export function getAnnotationSelector(): string {
  return ".highlight-overlay .highlight-rect, .lfcc-annotation";
}

/**
 * Get the selection toolbar locator.
 */
export async function getToolbar(page: Page) {
  return page.locator("[data-testid='selection-toolbar']");
}

// ============================================================================
// Robust PM-State-Based Helpers
// ============================================================================

/**
 * Get the number of top-level blocks in the editor via ProseMirror state.
 * More reliable than DOM queries.
 */
export async function getBlockCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const view = (
      window as unknown as { __lfccView?: { state?: { doc?: { childCount?: number } } } }
    ).__lfccView;
    return view?.state?.doc?.childCount ?? 0;
  });
}

/**
 * Get cursor info from ProseMirror state.
 * Returns block index, offset within block, and whether selection is empty.
 */
export async function getCursorInfo(page: Page): Promise<{
  blockIndex: number;
  offset: number;
  isEmpty: boolean;
  from: number;
  to: number;
}> {
  return await page.evaluate(() => {
    const view = (window as unknown as { __lfccView?: import("prosemirror-view").EditorView })
      .__lfccView;
    if (!view?.state) {
      return { blockIndex: -1, offset: 0, isEmpty: true, from: 0, to: 0 };
    }
    const { selection, doc } = view.state;
    const { from, to, empty: isEmpty } = selection;
    const $from = doc.resolve(from);

    // Find which top-level block we're in
    let blockIndex = -1;
    let pos = 0;
    for (let i = 0; i < doc.childCount; i++) {
      const blockSize = doc.child(i).nodeSize;
      if (from >= pos && from < pos + blockSize) {
        blockIndex = i;
        break;
      }
      pos += blockSize;
    }

    // Offset within the block's text content
    const offset = $from.parentOffset;

    return { blockIndex, offset, isEmpty, from, to };
  });
}

/**
 * Wait for the editor to be stable (no pending transactions).
 * Useful after rapid operations.
 */
export async function waitForEditorStable(page: Page, timeoutMs = 500): Promise<void> {
  await page.waitForTimeout(timeoutMs);
  // Additional check: ensure PM state is accessible
  await page.evaluate(() => {
    const view = (window as unknown as { __lfccView?: { state?: unknown } }).__lfccView;
    if (!view?.state) {
      throw new Error("Editor state not ready");
    }
  });
}

/**
 * Assert document content matches expected text using PM state.
 * More reliable than DOM textContent comparison.
 */
export async function assertDocumentContent(
  page: Page,
  expected: string,
  options: { timeout?: number } = {}
): Promise<void> {
  const timeout = options.timeout ?? 3000;
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const view = (
            window as unknown as { __lfccView?: { state?: { doc?: { textContent?: string } } } }
          ).__lfccView;
          return view?.state?.doc?.textContent ?? "";
        }),
      { timeout }
    )
    .toBe(expected);
}

/**
 * Assert document contains expected substring using PM state.
 */
export async function assertDocumentContains(
  page: Page,
  substring: string,
  options: { timeout?: number } = {}
): Promise<void> {
  const timeout = options.timeout ?? 3000;
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const view = (
            window as unknown as { __lfccView?: { state?: { doc?: { textContent?: string } } } }
          ).__lfccView;
          return view?.state?.doc?.textContent ?? "";
        }),
      { timeout }
    )
    .toContain(substring);
}

/**
 * Assert document does NOT contain expected substring using PM state.
 */
export async function assertDocumentNotContains(
  page: Page,
  substring: string,
  options: { timeout?: number } = {}
): Promise<void> {
  const timeout = options.timeout ?? 3000;
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const view = (
            window as unknown as { __lfccView?: { state?: { doc?: { textContent?: string } } } }
          ).__lfccView;
          return view?.state?.doc?.textContent ?? "";
        }),
      { timeout }
    )
    .not.toContain(substring);
}

/**
 * Press undo using Loro UndoManager via global hook.
 */
export async function pressUndo(page: Page): Promise<void> {
  await page.evaluate(() => {
    const globalAny = window as unknown as { __lfccUndo?: () => void };
    if (globalAny.__lfccUndo) {
      globalAny.__lfccUndo();
    } else {
      throw new Error("__lfccUndo hook not available");
    }
  });
  await page.waitForFunction(() => {
    const globalAny = window as unknown as { __lfccUndoState?: () => string };
    if (!globalAny.__lfccUndoState) {
      return true;
    }
    const state = globalAny.__lfccUndoState();
    return state === "idle" || state === "unknown";
  });
}

/**
 * Press redo using Loro UndoManager via global hook.
 */
export async function pressRedo(page: Page): Promise<void> {
  await page.evaluate(() => {
    const globalAny = window as unknown as { __lfccRedo?: () => void };
    if (globalAny.__lfccRedo) {
      globalAny.__lfccRedo();
    } else {
      throw new Error("__lfccRedo hook not available");
    }
  });
  await page.waitForFunction(() => {
    const globalAny = window as unknown as { __lfccUndoState?: () => string };
    if (!globalAny.__lfccUndoState) {
      return true;
    }
    const state = globalAny.__lfccUndoState();
    return state === "idle" || state === "unknown";
  });
}

/**
 * Set Loro UndoManager merge interval for deterministic undo steps in E2E.
 */
export async function setUndoMergeInterval(page: Page, intervalMs: number): Promise<void> {
  await page.evaluate((interval) => {
    const globalAny = window as unknown as { __lfccSetUndoMergeInterval?: (ms: number) => boolean };
    if (!globalAny.__lfccSetUndoMergeInterval) {
      throw new Error("__lfccSetUndoMergeInterval hook not available");
    }
    globalAny.__lfccSetUndoMergeInterval(interval);
  }, intervalMs);
}

/**
 * Start an explicit undo group to isolate a batch of operations.
 */
export async function startUndoGroup(page: Page): Promise<void> {
  await page.evaluate(() => {
    const globalAny = window as unknown as { __lfccUndoGroupStart?: () => boolean };
    if (!globalAny.__lfccUndoGroupStart) {
      throw new Error("__lfccUndoGroupStart hook not available");
    }
    globalAny.__lfccUndoGroupStart();
  });
}

/**
 * End the current undo group.
 */
export async function endUndoGroup(page: Page): Promise<void> {
  await page.evaluate(() => {
    const globalAny = window as unknown as { __lfccUndoGroupEnd?: () => boolean };
    if (!globalAny.__lfccUndoGroupEnd) {
      throw new Error("__lfccUndoGroupEnd hook not available");
    }
    globalAny.__lfccUndoGroupEnd();
  });
}

/**
 * Assert block count matches expected value.
 */
export async function assertBlockCount(
  page: Page,
  expected: number,
  options: { timeout?: number } = {}
): Promise<void> {
  const timeout = options.timeout ?? 3000;
  await expect.poll(() => getBlockCount(page), { timeout }).toBe(expected);
}

/**
 * Wait for a specific block count.
 */
export async function waitForBlockCount(
  page: Page,
  expected: number,
  options: { timeout?: number } = {}
): Promise<void> {
  const timeout = options.timeout ?? 5000;
  await expect.poll(() => getBlockCount(page), { timeout }).toBe(expected);
}
