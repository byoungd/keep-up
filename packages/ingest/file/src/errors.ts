/**
 * File Import Error Types
 */

export class FileImportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FileImportError";
  }
}

export class FileNotFoundError extends FileImportError {
  readonly path: string;
  constructor(path: string) {
    super(`File not found: ${path}`);
    this.name = "FileNotFoundError";
    this.path = path;
  }
}

export class PermissionError extends FileImportError {
  readonly path: string;
  constructor(path: string) {
    super(`Permission denied: ${path}`);
    this.name = "PermissionError";
    this.path = path;
  }
}

export class UnsupportedFormatError extends FileImportError {
  readonly filename: string;
  constructor(filename: string) {
    super(`Unsupported file format: ${filename}`);
    this.name = "UnsupportedFormatError";
    this.filename = filename;
  }
}

export class ParseError extends FileImportError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ParseError";
  }
}

export class EncryptedFileError extends FileImportError {
  constructor(message: string) {
    super(message);
    this.name = "EncryptedFileError";
  }
}

export class FileTooLargeError extends FileImportError {
  readonly size: number;
  readonly maxSize: number;
  constructor(size: number, maxSize: number) {
    super(`File size ${size} bytes exceeds maximum ${maxSize} bytes`);
    this.name = "FileTooLargeError";
    this.size = size;
    this.maxSize = maxSize;
  }
}

export class EmptyContentError extends FileImportError {
  constructor(message = "File contains no meaningful content") {
    super(message);
    this.name = "EmptyContentError";
  }
}
