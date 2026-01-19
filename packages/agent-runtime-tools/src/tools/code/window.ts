/**
 * Stateful Windowed File Viewer
 *
 * Provides a scrolling experience over large files using a fixed-size viewport.
 */

import * as path from "node:path";

import { readFile } from "./fileSystem";

// ============================================================================
// Types
// ============================================================================

export interface WindowState {
  currentFile: string | null;
  currentLine: number;
  windowSize: number;
}

export interface WindowViewResult {
  path: string;
  totalLines: number;
  viewportStart: number;
  viewportEnd: number;
  content: string;
  linesAbove: number;
  linesBelow: number;
}

// ============================================================================
// Factory
// ============================================================================

const DEFAULT_WINDOW_SIZE = 100;
const DEFAULT_OVERLAP = 20;

/**
 * Create a windowed file viewer.
 * Maintains state across calls for a scrolling experience.
 */
export function createWindowViewer(windowSize: number = DEFAULT_WINDOW_SIZE) {
  const state: WindowState = {
    currentFile: null,
    currentLine: 1,
    windowSize: Math.max(1, windowSize),
  };

  async function open(filePath: string, line?: number): Promise<WindowViewResult> {
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
    const targetLine = line ?? 1;
    const view = await buildView(resolvedPath, targetLine, state.windowSize);
    state.currentFile = resolvedPath;
    state.currentLine = view.currentLine;
    return view.result;
  }

  async function scrollUp(): Promise<WindowViewResult> {
    ensureFileOpen(state.currentFile);
    const shift = getScrollShift(state.windowSize);
    return goto(state.currentLine - shift);
  }

  async function scrollDown(): Promise<WindowViewResult> {
    ensureFileOpen(state.currentFile);
    const shift = getScrollShift(state.windowSize);
    return goto(state.currentLine + shift);
  }

  async function goto(line: number): Promise<WindowViewResult> {
    ensureFileOpen(state.currentFile);
    const view = await buildView(state.currentFile as string, line, state.windowSize);
    state.currentLine = view.currentLine;
    return view.result;
  }

  function getState(): WindowState {
    return { ...state };
  }

  return { open, scrollUp, scrollDown, goto, getState };
}

// ============================================================================
// Internals
// ============================================================================

function ensureFileOpen(filePath: string | null): void {
  if (!filePath) {
    throw new Error("No file is currently open. Use action 'open' first.");
  }
}

function getScrollShift(windowSize: number): number {
  const overlap = Math.min(DEFAULT_OVERLAP, windowSize - 1);
  return Math.max(1, windowSize - overlap);
}

async function buildView(
  filePath: string,
  targetLine: number,
  windowSize: number
): Promise<{ result: WindowViewResult; currentLine: number }> {
  const full = await readFile(filePath, { withLineNumbers: false });
  const lines = full.content.split("\n");
  const totalLines = full.totalLines;

  const { start, end, center } = computeViewport(totalLines, targetLine, windowSize);
  const content = formatRange(lines, start, end);

  return {
    currentLine: center,
    result: {
      path: full.path,
      totalLines,
      viewportStart: start,
      viewportEnd: end,
      content,
      linesAbove: Math.max(0, start - 1),
      linesBelow: Math.max(0, totalLines - end),
    },
  };
}

function computeViewport(totalLines: number, targetLine: number, windowSize: number) {
  const safeLine = clamp(targetLine, 1, Math.max(1, totalLines));
  const half = Math.floor(windowSize / 2);

  let start = safeLine - half;
  if (start < 1) {
    start = 1;
  }

  let end = start + windowSize - 1;
  if (end > totalLines) {
    end = totalLines;
    start = Math.max(1, end - windowSize + 1);
  }

  const center = Math.max(1, start + Math.floor((end - start) / 2));
  return { start, end, center };
}

function formatRange(lines: string[], startLine: number, endLine: number): string {
  const safeStart = Math.max(1, startLine);
  const safeEnd = Math.min(endLine, lines.length);
  const selected = lines.slice(safeStart - 1, safeEnd);
  const maxLineNumWidth = String(safeEnd).length;

  return selected
    .map((line, idx) => {
      const lineNum = String(safeStart + idx).padStart(maxLineNumWidth, " ");
      return `${lineNum}: ${line}`;
    })
    .join("\n");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
