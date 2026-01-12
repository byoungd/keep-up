# Version Migration Guide — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2025-01-01  
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
| 0.9.x        | 0.9.y      | Yes        | No (patch)        |
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
- Bug fixes only
- No migration required

### 1.3 Breaking Changes for v0.9

The following items are considered breaking for pre-0.9 implementations:
- **Anchor Integrity:** Anchors MUST include a CRC32 checksum. Decoders MUST fail-closed on mismatch.
- **Deterministic Negotiation:** Policy negotiation algorithm is fully deterministic. Field order matters in canonicalization.
- **AI Limits:** `ai_sanitization_policy.limits` (size, depth, attrs) is REQUIRED and strictly enforced.
- **Canonical Attributes:** Only `link` marks may have `href`. Invalid attributes are stripped with diagnostics.
- **Policy Manifest:** Unknown top-level fields are rejected. Use `extensions` for forward compatibility.

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
**Last Updated:** 2025-01-01
