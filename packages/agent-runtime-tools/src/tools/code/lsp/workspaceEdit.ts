import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { Position, TextDocumentEdit, TextEdit, WorkspaceEdit } from "./protocol";

export interface AppliedWorkspaceEdit {
  file: string;
  editCount: number;
}

export interface ApplyWorkspaceEditResult {
  files: AppliedWorkspaceEdit[];
}

export async function applyWorkspaceEdit(edit: WorkspaceEdit): Promise<ApplyWorkspaceEditResult> {
  const changes = collectWorkspaceChanges(edit);
  const results: AppliedWorkspaceEdit[] = [];

  for (const change of changes) {
    const filePath = resolveUriToPath(change.uri);
    const content = await fs.readFile(filePath, "utf8");
    const updated = applyTextEdits(content, change.edits);
    await fs.writeFile(filePath, updated, "utf8");
    results.push({ file: filePath, editCount: change.edits.length });
  }

  return { files: results };
}

export function collectWorkspaceChanges(
  edit: WorkspaceEdit
): Array<{ uri: string; edits: TextEdit[] }> {
  const changes: Array<{ uri: string; edits: TextEdit[] }> = [];

  if (edit.changes) {
    for (const [uri, edits] of Object.entries(edit.changes)) {
      if (edits.length > 0) {
        changes.push({ uri, edits });
      }
    }
  }

  if (edit.documentChanges) {
    for (const change of edit.documentChanges) {
      if (isTextDocumentEdit(change) && change.edits.length > 0) {
        changes.push({ uri: change.textDocument.uri, edits: change.edits });
      }
    }
  }

  return changes;
}

function isTextDocumentEdit(value: unknown): value is TextDocumentEdit {
  if (!value || typeof value !== "object") {
    return false;
  }
  const edit = value as TextDocumentEdit;
  return Boolean(edit.textDocument?.uri && Array.isArray(edit.edits));
}

function resolveUriToPath(uri: string): string {
  if (uri.startsWith("file://")) {
    return path.resolve(fileURLToPath(uri));
  }
  return path.resolve(uri);
}

function applyTextEdits(content: string, edits: TextEdit[]): string {
  if (edits.length === 0) {
    return content;
  }

  const lineOffsets = buildLineOffsets(content);
  const ranges = edits.map((edit) => ({
    start: positionToOffset(edit.range.start, lineOffsets, content),
    end: positionToOffset(edit.range.end, lineOffsets, content),
    newText: edit.newText,
  }));

  ranges.sort((a, b) => b.start - a.start || b.end - a.end);

  let lastStart = content.length + 1;
  let updated = content;
  for (const edit of ranges) {
    if (edit.end > lastStart) {
      throw new Error("Overlapping workspace edits are not supported.");
    }
    if (edit.start > edit.end) {
      throw new Error("Invalid workspace edit range.");
    }
    updated = updated.slice(0, edit.start) + edit.newText + updated.slice(edit.end);
    lastStart = edit.start;
  }

  return updated;
}

function buildLineOffsets(content: string): number[] {
  const offsets = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function positionToOffset(position: Position, offsets: number[], content: string): number {
  const lineStart = offsets[position.line];
  if (lineStart === undefined) {
    throw new Error(`Invalid LSP position line: ${position.line}`);
  }

  const nextLineStart = offsets[position.line + 1];
  const lineEnd = nextLineStart === undefined ? content.length : nextLineStart - 1;
  const lineLength = lineEnd - lineStart;
  if (position.character > lineLength) {
    throw new Error(`Invalid LSP position character: ${position.character}`);
  }

  return lineStart + position.character;
}
