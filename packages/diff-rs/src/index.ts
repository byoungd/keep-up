import type { CreatePatchOptionsNonabortable, StructuredPatchHunk } from "diff";
import {
  applyPatch as applyPatchJs,
  createTwoFilesPatch as createTwoFilesPatchJs,
  formatPatch,
  parsePatch,
  reversePatch as reverseStructuredPatch,
  structuredPatch,
} from "diff";
import { loadNativeBinding } from "./native";
import type { DiffHunk, DiffLine } from "./types";

export type { DiffHunk, DiffLine, DiffLineType } from "./types";

const DEFAULT_CONTEXT = 4;

export type CreatePatchCallback = (patch: string | undefined) => void;
export type CreatePatchOptions = CreatePatchOptionsNonabortable | CreatePatchCallback;

export function diffLines(oldText: string, newText: string): DiffHunk[] {
  const native = loadNativeBinding();
  if (native) {
    return native.diffLines(oldText, newText);
  }

  const patch = structuredPatch("original", "modified", oldText, newText, undefined, undefined, {
    context: DEFAULT_CONTEXT,
  });

  return patch.hunks.map(toDiffHunkFromStructuredPatch);
}

export function diffUnified(
  oldText: string,
  newText: string,
  context: number = DEFAULT_CONTEXT
): string {
  const native = loadNativeBinding();
  if (native) {
    return native.diffUnified(oldText, newText, context);
  }

  return createTwoFilesPatchJs("original", "modified", oldText, newText, undefined, undefined, {
    context,
  });
}

export function createTwoFilesPatch(
  oldFileName: string,
  newFileName: string,
  oldStr: string,
  newStr: string,
  oldHeader?: string,
  newHeader?: string,
  options?: CreatePatchOptions
): string | undefined {
  const native = loadNativeBinding();
  if (!native) {
    return createTwoFilesPatchJs(
      oldFileName,
      newFileName,
      oldStr,
      newStr,
      oldHeader,
      newHeader,
      options as CreatePatchOptionsNonabortable
    );
  }

  if (isCallbackOption(options)) {
    return createTwoFilesPatchJs(
      oldFileName,
      newFileName,
      oldStr,
      newStr,
      oldHeader,
      newHeader,
      options
    );
  }

  if (!canUseNativeOptions(options)) {
    return createTwoFilesPatchJs(
      oldFileName,
      newFileName,
      oldStr,
      newStr,
      oldHeader,
      newHeader,
      options
    );
  }

  return native.createTwoFilesPatch(
    oldFileName,
    newFileName,
    oldStr,
    newStr,
    oldHeader,
    newHeader,
    options?.context
  );
}

export function applyPatch(original: string, patch: string): string {
  const native = loadNativeBinding();
  if (native) {
    return native.applyPatch(original, patch);
  }

  const result = applyPatchJs(original, patch);
  if (result === false) {
    throw new Error("Failed to apply patch.");
  }
  return result;
}

export function reversePatch(patch: string): string {
  const native = loadNativeBinding();
  if (native) {
    return native.reversePatch(patch);
  }

  const parsed = parsePatch(patch);
  if (parsed.length === 0) {
    return patch;
  }

  return formatPatch(reverseStructuredPatch(parsed));
}

function isCallbackOption(options: CreatePatchOptions | undefined): options is CreatePatchCallback {
  return typeof options === "function";
}

function canUseNativeOptions(options?: CreatePatchOptionsNonabortable): boolean {
  if (!options) {
    return true;
  }
  if (typeof options.callback === "function") {
    return false;
  }
  if (options.ignoreWhitespace) {
    return false;
  }
  if (options.stripTrailingCr) {
    return false;
  }
  if (options.headerOptions) {
    return false;
  }
  return true;
}

function toDiffHunkFromStructuredPatch(hunk: StructuredPatchHunk): DiffHunk {
  let oldLine = hunk.oldStart;
  let newLine = hunk.newStart;
  const lines: DiffLine[] = [];

  for (const line of hunk.lines) {
    if (line.startsWith("\\ No newline at end of file")) {
      continue;
    }

    const marker = line.slice(0, 1);
    const content = line.slice(1);

    switch (marker) {
      case " ":
        lines.push({
          type: "context",
          content,
          oldLineNo: oldLine,
          newLineNo: newLine,
        });
        oldLine += 1;
        newLine += 1;
        break;
      case "-":
        lines.push({
          type: "remove",
          content,
          oldLineNo: oldLine,
        });
        oldLine += 1;
        break;
      case "+":
        lines.push({
          type: "add",
          content,
          newLineNo: newLine,
        });
        newLine += 1;
        break;
      default:
        lines.push({
          type: "context",
          content: line,
        });
        break;
    }
  }

  return {
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    lines,
  };
}
