"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseGlobalDropTargetOptions {
  /** Allowed file extensions (without dot), e.g. ['md', 'txt'] */
  allowedExtensions?: string[];
  /** Called when valid files are dropped */
  onFileDrop?: (files: File[]) => void;
  /** Called when valid URLs are dropped */
  onUrlDrop?: (urls: string[]) => void;
  /** Called when unsupported files are dropped */
  onUnsupportedDrop?: (files: File[]) => void;
}

const DEFAULT_EXTENSIONS = ["md", "markdown", "txt", "html", "htm"];

/**
 * Parse URL from various DataTransfer formats.
 */
function parseUrlFromDataTransfer(dataTransfer: DataTransfer): string[] {
  const urls: string[] = [];

  // Try text/uri-list first (standard for dragged URLs)
  const uriList = dataTransfer.getData("text/uri-list");
  if (uriList) {
    const lines = uriList.split(/\r?\n/).filter((line) => line && !line.startsWith("#"));
    for (const line of lines) {
      if (isValidHttpUrl(line)) {
        urls.push(line);
      }
    }
  }

  // Fallback to text/plain
  if (urls.length === 0) {
    const plainText = dataTransfer.getData("text/plain");
    if (plainText && isValidHttpUrl(plainText.trim())) {
      urls.push(plainText.trim());
    }
  }

  return urls;
}

/**
 * Check if string is a valid http/https URL.
 */
function isValidHttpUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Get file extension without dot.
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return "";
  }
  return filename.slice(lastDot + 1).toLowerCase();
}

/**
 * Categorize files by whether they have supported extensions.
 */
function categorizeFiles(
  fileList: FileList,
  allowedExtensions: string[]
): { supportedFiles: File[]; unsupportedFiles: File[] } {
  const supportedFiles: File[] = [];
  const unsupportedFiles: File[] = [];

  for (const file of Array.from(fileList)) {
    const ext = getFileExtension(file.name);
    if (allowedExtensions.includes(ext)) {
      supportedFiles.push(file);
    } else {
      unsupportedFiles.push(file);
    }
  }

  return { supportedFiles, unsupportedFiles };
}

/**
 * Hook for managing global drag & drop events with a counter-based
 * approach to prevent flicker when dragging over child elements.
 */
export function useGlobalDropTarget(options: UseGlobalDropTargetOptions = {}) {
  const {
    allowedExtensions = DEFAULT_EXTENSIONS,
    onFileDrop,
    onUrlDrop,
    onUnsupportedDrop,
  } = options;

  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);

      if (!e.dataTransfer) {
        return;
      }

      const { supportedFiles, unsupportedFiles } = categorizeFiles(
        e.dataTransfer.files,
        allowedExtensions
      );

      // If we have supported files, import them
      if (supportedFiles.length > 0) {
        onFileDrop?.(supportedFiles);
        return;
      }

      // Check for URLs if no files
      const urls = parseUrlFromDataTransfer(e.dataTransfer);
      if (urls.length > 0) {
        onUrlDrop?.(urls);
        return;
      }

      // Report unsupported files
      if (unsupportedFiles.length > 0) {
        onUnsupportedDrop?.(unsupportedFiles);
      }
    },
    [allowedExtensions, onFileDrop, onUrlDrop, onUnsupportedDrop]
  );

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape" && dragCounterRef.current > 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  }, []);

  // Attach global listeners
  useEffect(() => {
    const doc = document;
    doc.addEventListener("dragenter", handleDragEnter);
    doc.addEventListener("dragleave", handleDragLeave);
    doc.addEventListener("dragover", handleDragOver);
    doc.addEventListener("drop", handleDrop);
    doc.addEventListener("keydown", handleKeyDown);

    return () => {
      doc.removeEventListener("dragenter", handleDragEnter);
      doc.removeEventListener("dragleave", handleDragLeave);
      doc.removeEventListener("dragover", handleDragOver);
      doc.removeEventListener("drop", handleDrop);
      doc.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop, handleKeyDown]);

  return {
    isDragging,
    /** Supported extensions for display */
    supportedExtensions: allowedExtensions,
  };
}

export { isValidHttpUrl, getFileExtension };
