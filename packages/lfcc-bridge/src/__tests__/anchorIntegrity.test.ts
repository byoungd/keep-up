import { Cursor, LoroDoc, type LoroText } from "loro-crdt";
import { beforeEach, describe, expect, it } from "vitest";
import {
  decodeAnchor,
  encodeAnchor,
  encodeAnchorBase64,
  validateAnchorIntegrity,
} from "../anchors/loroAnchors";

const getCursorOrThrow = (text: LoroText): Cursor => {
  const cursor = text.getCursor(5, 1);
  if (!cursor) {
    throw new Error("Expected cursor to be defined");
  }
  return cursor;
};

describe("Anchor Integrity", () => {
  let doc: LoroDoc;
  let text: LoroText;

  beforeEach(() => {
    doc = new LoroDoc();
    text = doc.getText("text");
    text.insert(0, "Hello World");
  });

  it("should encode anchor with checksum", () => {
    const cursor = getCursorOrThrow(text);
    const encoded = encodeAnchor(cursor);
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.length).toBeGreaterThan(16);
  });

  it("should decode valid anchor with checksum", () => {
    const cursor = getCursorOrThrow(text);
    const encoded = encodeAnchor(cursor);
    const decoded = decodeAnchor(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded).toBeInstanceOf(Cursor);
  });

  it("should decode valid base64 anchor", () => {
    const cursor = getCursorOrThrow(text);
    const encoded = encodeAnchorBase64(cursor);
    const decoded = decodeAnchor(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded).toBeInstanceOf(Cursor);
  });

  it("should reject anchor with invalid checksum", () => {
    const cursor = getCursorOrThrow(text);
    const encoded = encodeAnchor(cursor);
    // Corrupt the tag
    const tagIndex = encoded.length - 1;
    const tagValue = encoded[tagIndex] ?? 0;
    encoded[tagIndex] = (tagValue + 1) % 256;
    const decoded = decodeAnchor(encoded);
    expect(decoded).toBeNull();
  });

  it("should reject anchor with corrupted data", () => {
    const cursor = getCursorOrThrow(text);
    const encoded = encodeAnchor(cursor);
    // Corrupt the data (not checksum)
    expect(encoded.length).toBeGreaterThan(1);
    const dataValue = encoded[1] ?? 0;
    encoded[1] = (dataValue + 1) % 256;
    const decoded = decodeAnchor(encoded);
    expect(decoded).toBeNull();
  });

  it("should reject anchor that is too short", () => {
    const shortAnchor = new Uint8Array([1, 2, 3]); // Too short
    const decoded = decodeAnchor(shortAnchor);
    expect(decoded).toBeNull();
  });

  it("should validate anchor integrity", () => {
    const cursor = getCursorOrThrow(text);
    const encoded = encodeAnchor(cursor);
    expect(validateAnchorIntegrity(encoded)).toBe(true);
    expect(validateAnchorIntegrity(encodeAnchorBase64(cursor))).toBe(true);
  });

  it("should reject invalid anchor integrity", () => {
    const cursor = getCursorOrThrow(text);
    const encoded = encodeAnchor(cursor);
    // Corrupt tag
    const checksumIndex = encoded.length - 1;
    const checksumValue = encoded[checksumIndex] ?? 0;
    encoded[checksumIndex] = (checksumValue + 1) % 256;
    expect(validateAnchorIntegrity(encoded)).toBe(false);
    expect(validateAnchorIntegrity("not-base64*")).toBe(false);
  });
});
