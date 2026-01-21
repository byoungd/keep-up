# Version Migration Guide — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2026-01-14  
**Audience:** Platform architects, migration engineers.  
**Source of truth:** LFCC v0.9 RC Policy Manifest versioning

---

## 0. Purpose

This guide specifies version compatibility and migration procedures for LFCC protocol versions.

---

## 1. Version Compatibility Matrix

### 1.1 Compatibility Rules

| From Version | To Version | Compatible | Migration Required |
|--------------|------------|------------|-------------------|
| 0.9.x        | 0.9.y      | Yes        | Depends on patch notes |
| 0.9.x        | 0.10.x     | Maybe      | Yes (minor)       |
| 0.x          | 1.0        | Maybe      | Yes (major)       |

### 1.2 Breaking Changes

**Major Version (0.x → 1.0):**
- Protocol structure changes
- Axiom changes
- Data model changes

**Minor Version (0.9 → 0.10):**
- New required fields
- Policy changes
- Algorithm changes

**Patch Version (0.9.1 → 0.9.2):**
- Protocol hardening; policy and persistence updates required for conformance
- Update manifests to include `integrity_policy.document_checksum` (algorithm `LFCC_DOC_V1`, strategy `two_tier`)
- Bump `ai_sanitization_policy.version` to `v2` and enforce Appendix B
- Persisted snapshots/updates MUST use the Storage Envelope (Appendix D)

### 1.2.1 v0.9.1 AI-native Extension (Optional)

- v0.9.1 remains patch-compatible; AI-native fields are optional and negotiated.
- For mixed peers, place AI-native fields under `extensions.ai_native` to avoid unknown top-level field rejection.
- If any participant lacks AI-native support, fall back to v0.9 AI behavior.

### 1.3 Breaking Changes for v0.9

The following items are considered breaking for pre-0.9 implementations:
- **Anchor Integrity:** Anchors MUST include a CRC32 checksum. Decoders MUST fail-closed on mismatch.
- **Deterministic Negotiation:** Policy negotiation algorithm is fully deterministic. Field order matters in canonicalization.
- **AI Limits:** `ai_sanitization_policy.limits` (size, depth, attrs) is REQUIRED and strictly enforced.
- **Canonical Attributes:** Only `link` marks may have `href`. Invalid attributes are stripped with diagnostics.
- **Policy Manifest:** Unknown top-level fields are rejected. Use `extensions` for forward compatibility.

### 1.3.1 Breaking Changes for v0.9.2 (RC Update)

The following items are required to maintain v0.9.2 conformance:
- **Document Checksum:** `integrity_policy.document_checksum` MUST be present and use `LFCC_DOC_V1` with `two_tier`.
- **Sanitization v2:** `ai_sanitization_policy.version` MUST be `v2` (Appendix B).
- **Storage Envelope:** Persisted snapshots/updates MUST use the Appendix D envelope.
  - Core kernel now ships checksum helpers (`computeBlockDigest`, `computeDocumentChecksum`, `computeDocumentChecksumTier2`) that apply required text normalization (LF endings, NFC, control-char stripping). Integrations SHOULD use these helpers instead of ad-hoc hashing.

### 1.3.2 Breaking Changes for v0.9.3 (RC Update)

The following items are required to maintain v0.9.3 conformance:
- **Sanitization v3:** `ai_sanitization_policy.version` MUST be `v3` (Appendix B).
- **Checksum Text Cleaning:** Appendix A control-character stripping MUST be applied for checksum inputs.
- **Storage Compression:** Payload bytes MUST be uncompressed; apply compression only to the serialized envelope.
- **Recovery Telemetry:** Implementations MUST emit `INTEGRITY_RECOVERED_SILENTLY` and `INTEGRITY_RECOVERED_FULL_RESYNC` when applicable.

### 1.3.3 v0.9.2 Migration Checklist (Recommended)

- Update policy manifests to include `integrity_policy.document_checksum` and bump version fields (`integrity_policy.version`, `ai_sanitization_policy.version`).
- Verify document checksum computation matches Appendix A (JCS serialization, UTF-8, document order).
- Update AI sanitization to Appendix B (attribute whitelist + URL regex + forbidden schemes).
- Wrap snapshots/updates in the Appendix D storage envelope and validate checksums on read.
- Update AI gateway error handling to Appendix C codes and transport mappings.

---

## 1.4 Extensions Pattern (Forward Compatibility)

To allow forward-compatible metadata without breaking older clients:
1. **Validation Rule:** Parsers MUST reject unknown top-level fields in `PolicyManifest`.
2. **Extensions Namespace:** Use the `extensions` field (optional object) for custom data.
3. **Vendor Prefix:** Keys inside `extensions` should be vendor-prefixed (e.g., `acme.analytics`).

### Example

```json
{
  "version": "0.9.0",
  "extensions": {
    "acme.metadata": { "trackingId": "123" }
  },
  "capabilities": ["text", "bold"]
}
```

---

## 2. Migration Procedures

### 2.1 Pre-Migration Checklist

- [ ] Identify current version
- [ ] Identify target version
- [ ] Review breaking changes
- [ ] Backup data
- [ ] Test migration on sample data

### 2.2 Migration Steps

1. **Detect Version Mismatch**
2. **Run Migration Scripts**
3. **Validate Migrated Data**
4. **Update Version Metadata**
5. **Verify Functionality**

### 2.3 Example Migration Pseudocode (Anchor Re-encode)

```ts
/**
 * Migrate anchors from v0.8 (raw coordinates) to v0.9 (CRC32 checksum).
 * @param anchors - List of legacy encoded anchors
 * @param doc - Document snapshot for context hash generation
 */
function migrateAnchorsToV09(anchors: string[], doc: BlockMap): string[] {
  const migrated: string[] = [];

  for (const rawAnchor of anchors) {
    // 1. Decode legacy format
    const legacy = decodeV08(rawAnchor);
    if (!legacy) {
      console.warn("Failed to decode legacy anchor:", rawAnchor);
      continue;
    }

    // 2. Validate existence in doc
    const block = doc.get(legacy.blockId);
    if (!block) {
      console.warn("Anchor block not found:", legacy.blockId);
      continue;
    }

    // 3. Compute context hash (new requirement)
    const contextHash = computeContextHash(block, legacy.start, legacy.end);

    // 4. Re-encode with checksum
    const v09Anchor = encodeV09({
      block_id: legacy.blockId,
      start: legacy.start,
      end: legacy.end,
      context_hash: contextHash
    });

    migrated.push(v09Anchor);
  }

  return migrated;
}
```

---

### 2.4 Example Migration Pseudocode (Storage Envelope)

```ts
/**
 * Wrap a Loro snapshot in the LFCC storage envelope (Appendix D).
 */
function wrapSnapshotForStorage(payloadBytes: Uint8Array): StorageEnvelope {
  return encodeStorageEnvelope({
    specVersion: "0.9",
    crdtFormat: "loro_snapshot",
    payloadEncoding: "binary",
    payloadBytes
  });
}

/**
 * Validate and unwrap a storage envelope before loading.
 */
function unwrapSnapshotFromStorage(envelope: StorageEnvelope): Uint8Array {
  const decoded = decodeStorageEnvelope(envelope);
  if (!decoded.checksumValid) {
    throw new Error("STORAGE_ENVELOPE_CHECKSUM_MISMATCH");
  }
  return decoded.payloadBytes;
}
```

---

### 2.5 Storage Envelope Verification Checklist (Recommended)

- Verify `lfcc_storage_ver` is supported and matches Appendix D.
- Validate `checksum` before decoding payload bytes.
- For JSON payloads, confirm JCS serialization was used when generating checksum.
- Reject unknown `crdt_format` values.
- Log and surface `STORAGE_ENVELOPE_VERSION_UNSUPPORTED` and `STORAGE_ENVELOPE_CHECKSUM_MISMATCH`.

---

## 3. Backward Compatibility

### 3.1 Reading Old Versions

Implementations SHOULD support reading data from previous minor versions (e.g., a v0.9 peer reading v0.8 anchors if negotiated).

### 3.2 Forward Compatibility

Implementations MUST reject data from future versions (fail-closed) unless contained in `extensions`.

---

## 4. References

- **LFCC Protocol:** Policy Manifest versioning
- **Semantic Versioning:** https://semver.org/

---

**Document Version:** 1.0  
**Last Updated:** 2026-01-14
