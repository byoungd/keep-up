# Custom Types Extension Guide — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2025-01-01  
**Audience:** Platform architects, extension developers.  
**Source of truth:** LFCC v0.9 RC §3.1 (Blocks), §3.2 (Annotations)

---

## 0. Purpose

This guide specifies how to extend LFCC with custom block types and annotation kinds while maintaining protocol compliance.

---

## 1. Custom Type Registration

### 1.1 Policy Manifest Registration

Custom types MUST be registered in the policy manifest:

```json
{
  "block_id_policy": {
    "version": "v1",
    "overrides": {
      "custom_block_type": {
        "version": "v1",
        "behavior": "keep_id",
        "test_requirements": ["test_custom_block_001"]
      }
    }
  },
  "custom_types": {
    "blocks": {
      "custom_block_type": {
        "schema_version": "v1",
        "validation_schema": { /* JSON Schema */ },
        "canonicalization_rules": "preserve_structure"
      }
    },
    "annotations": {
      "custom_annotation_kind": {
        "schema_version": "v1",
        "validation_schema": { /* JSON Schema */ },
        "relocation_policy": "level_1_only"
      }
    }
  }
}
```

### 1.2 Schema Requirements

**Block Types:**
- Must define structure (attrs, children)
- Must specify canonicalization behavior
- Must provide validation schema

**Annotation Kinds:**
- Must define payload structure
- Must specify relocation policy
- Must provide validation schema

---

## 2. Validation Requirements

### 2.1 Schema Validation

All custom types MUST be validated against their schemas:

```typescript
function validateCustomBlock(
  block: Block,
  schema: CustomTypeSchema
): Result<Block, Error> {
  const validator = new JSONSchemaValidator(schema.validation_schema);
  const result = validator.validate(block);
  
  if (!result.valid) {
    return {
      ok: false,
      error: {
        code: "CUSTOM_TYPE_VALIDATION_FAILED",
        details: result.errors
      }
    };
  }
  
  return { ok: true, value: block };
}
```

### 2.2 Version Compatibility

Custom type schemas are versioned. Migration between versions:

```typescript
function migrateCustomType(
  data: unknown,
  fromVersion: string,
  toVersion: string
): Result<unknown, Error> {
  // Implement version-specific migration
  // Must be deterministic and reversible (if possible)
}
```

---

## 3. Canonicalization Behavior

### 3.1 Custom Block Canonicalization

**Options:**
- `preserve_structure`: Preserve custom structure in canonical form
- `normalize_to_paragraph`: Normalize to paragraph (loses custom semantics)
- `custom_function`: Provide custom canonicalization function

```typescript
function canonicalizeCustomBlock(
  block: CustomBlock,
  policy: CanonicalizerPolicy
): CanonBlock {
  if (policy.custom_types.blocks[block.type].canonicalization_rules === "preserve_structure") {
    return {
      id: generateCanonId(block),
      type: block.type,
      attrs: normalizeAttrs(block.attrs),
      children: canonicalizeChildren(block.children)
    };
  }
  // ... other rules
}
```

---

## 4. Policy Negotiation for Custom Types

### 4.1 Capability Intersection

Custom types are negotiated like standard capabilities:

```typescript
function negotiateCustomTypes(
  manifests: PolicyManifest[]
): CustomTypesConfig {
  const allCustomTypes = new Set<string>();
  
  // Collect all custom types
  for (const manifest of manifests) {
    if (manifest.custom_types) {
      for (const type of Object.keys(manifest.custom_types.blocks || {})) {
        allCustomTypes.add(type);
      }
    }
  }
  
  // Intersection: only types supported by all participants
  const supportedTypes = new Set<string>();
  for (const type of allCustomTypes) {
    if (manifests.every(m => supportsCustomType(m, type))) {
      supportedTypes.add(type);
    }
  }
  
  return { supportedTypes: Array.from(supportedTypes) };
}
```

### 4.2 Degradation

If custom type is not supported by all participants:
- Existing custom blocks/annotations become read-only
- Cannot create new custom blocks/annotations
- User notification required

---

## 5. Migration Strategies

### 5.1 Version Migration

When custom type schema version changes:

1. Detect version mismatch
2. Run migration function
3. Validate migrated data
4. Update stored data

### 5.2 Removal Migration

When custom type is removed:

1. Convert custom blocks to standard blocks (if possible)
2. Mark custom annotations as orphaned
3. User notification

---

## 6. Implementation Checklist

- [ ] Define custom type schema
- [ ] Register in policy manifest
- [ ] Implement validation
- [ ] Implement canonicalization
- [ ] Add migration functions
- [ ] Add negotiation support
- [ ] Add degradation handling
- [ ] Add tests

---

## 7. References

- **LFCC Protocol:** §3.1 Blocks
- **LFCC Protocol:** §3.2 Annotations
- **LFCC Protocol:** §2 Policy Manifest

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-01

