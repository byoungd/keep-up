# Security Best Practices — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2026-01-14  
**Audience:** Security engineers, backend engineers, AI platform engineers.  
**Source of truth:** LFCC v0.9 RC §11 (AI Gateway), §5 (Stable Anchors), Appendix B (Sanitization Profile)

---

## 0. Purpose

This guide provides security best practices for LFCC implementations, covering AI payload validation, hash collision handling, anchor security, and relocation policy boundaries.

---

## 1. AI Payload Validation Security

### 1.1 Sanitization Rules

**Whitelist Approach (REQUIRED):**
- Follow LFCC v0.9 RC Appendix B (Sanitization Profile).
- Only allow explicitly permitted tags, attributes, and structures.
- Reject all unknown elements by default.
- Enforce the attribute whitelist: `link.href`, `code.language`, `table_cell.rowspan`, `table_cell.colspan`, `image.src/alt/title/width/height`, `video.src/poster/controls`.

**Security Review Checklist:**
- [ ] Script tags blocked
- [ ] Style tags blocked
- [ ] Event handlers blocked (onclick, onerror, etc.)
- [ ] iframe/object/embed blocked
- [ ] data: URLs blocked (unless explicitly allowed for image-only data URIs)
- [ ] javascript: and vbscript: URLs blocked
- [ ] URL regex enforced: `^(https?|mailto):[^\\s]+$`
- [ ] CSS injection prevented

### 1.2 URL Validation

Apply URL validation to all URL-bearing attributes (`href`, `src`, `poster`).

```typescript
function validateURL(url: string): boolean {
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();

  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:")
  ) {
    return false;
  }

  return /^(https?|mailto):\S+$/i.test(trimmed);
}
```

### 1.3 Resource Limits

**Payload Size Limits:**
- Maximum payload size: 1MB (configurable)
- Maximum nesting depth: 100 levels
- Maximum attribute count: 1000 per element

**Protocol requirement:** These limits MUST be enforced according to `ai_sanitization_policy.limits`.

**Timeout Protection:**
- Schema validation timeout: 5 seconds
- Canonicalization timeout: 10 seconds

---

### 1.4 AI-native Governance (Optional)

When AI-native is negotiated, apply additional security controls:
- Authenticate `agent_id` and enforce signed request requirements.
- Enforce request idempotency windows to prevent replay.
- Apply data access policies (context limits, redaction) before model invocation.
- Emit append-only audit records for accepted and rejected requests.

See `23_AI_Native_Extension.md` for normative requirements.

---

## 2. Hash Collision Handling

### 2.1 Collision Detection

While SHA-256 collisions are extremely rare, implementations should handle them:

```typescript
function verifyContextHash(
  span: Span,
  blockText: string
): Result<boolean, Error> {
  const computedHash = computeContextHash(blockText, span.block_id);
  
  if (computedHash === span.context_hash) {
    return { ok: true, value: true };
  }
  
  // Potential collision: compare full context
  const fullContext = getFullContext(span);
  if (fullContext === blockText.slice(span.start, span.end)) {
    // Hash mismatch but context matches: potential collision
    logPotentialCollision(span, computedHash, span.context_hash);
    return { ok: true, value: true }; // Accept with warning
  }
  
  return { ok: true, value: false }; // Mismatch
}
```

### 2.2 Collision Logging

**When potential collision detected:**
- Log with full context
- Alert security team
- Preserve evidence for analysis

---

## 3. Anchor Security

### 3.1 Anchor Integrity

**Checksum Validation:**
- Include checksum in anchor encoding
- Validate checksum before use
- Reject malformed anchors
  
**Protocol requirement:** Checksum validation is REQUIRED by ANCHOR-ENC-002.

```typescript
function validateAnchor(anchor: Anchor): boolean {
  const decoded = decodeAnchor(anchor);
  const computedChecksum = computeChecksum(decoded.data);
  
  return computedChecksum === decoded.checksum;
}
```

### 3.2 Anchor Predictability

**Security Considerations:**
- Anchors should not be easily predictable
- Use cryptographic randomness for anchor generation
- Avoid sequential anchor patterns

### 3.3 Rate Limiting

**Anchor Resolution Rate Limits:**
- Maximum resolutions per second: 1000
- Maximum resolutions per minute: 10000
- Block suspicious patterns

---

## 3.4 Storage Envelope Security

### 3.4.1 Validation Rules
- Implementations MUST reject unsupported `lfcc_storage_ver`.
- Implementations MUST validate `checksum` before decoding payload bytes.
- For JSON payloads, implementations MUST require JCS serialization when computing checksum.
- Implementations MUST reject unknown `crdt_format` values.

### 3.4.2 Logging and Telemetry
- Implementations MUST emit `STORAGE_ENVELOPE_VERSION_UNSUPPORTED` on version mismatch.
- Implementations MUST emit `STORAGE_ENVELOPE_CHECKSUM_MISMATCH` on checksum failure.

---

## 4. Relocation Policy Security

### 4.1 Security Boundaries

**Level 1 (Default):**
- Exact context hash match only
- No relocation allowed
- Safest option

**Level 2 (Policy-Controlled):**
- Distance limit: `level_2_max_distance_ratio` (default 0.10 = 10%)
- Requires user confirmation
- Log all relocations

**Level 3 (Policy-Controlled):**
- Block radius limit: `level_3_max_block_radius` (default 2)
- Requires explicit user confirmation
- Audit log required

### 4.2 Relocation Validation

```typescript
function validateRelocation(
  originalSpan: Span,
  relocatedSpan: Span,
  policy: RelocationPolicy
): Result<boolean, Error> {
  // Verify distance limits
  const distance = computeDistance(originalSpan, relocatedSpan);
  const maxDistance = policy.level_2_max_distance_ratio * getBlockLength(originalSpan.block_id);
  
  if (distance > maxDistance) {
    return {
      ok: false,
      error: {
        code: "RELOCATION_DISTANCE_EXCEEDED",
        message: "Relocation exceeds maximum allowed distance"
      }
    };
  }
  
  // Verify user confirmation
  if (!hasUserConfirmation(relocatedSpan)) {
    return {
      ok: false,
      error: {
        code: "RELOCATION_NOT_CONFIRMED",
        message: "User confirmation required for relocation"
      }
    };
  }
  
  return { ok: true, value: true };
}
```

---

## 5. Security Testing

### 5.1 Penetration Testing

**Test Areas:**
- AI payload injection attacks
- XSS via annotation payloads
- Anchor manipulation attacks
- Relocation policy abuse

### 5.2 Fuzzing

**Security Fuzzing:**
- Malicious payloads in AI requests
- Invalid anchor encodings
- Oversized payloads
- Deeply nested structures

---

## 6. Implementation Checklist

- [ ] Implement comprehensive sanitization
- [ ] Add URL validation
- [ ] Add resource limits
- [ ] Implement hash collision detection
- [ ] Add anchor integrity checks
- [ ] Implement relocation security boundaries
- [ ] Add security logging
- [ ] Conduct security review
- [ ] Add penetration tests
- [ ] Add security fuzzing

---

## 7. References

- **LFCC Protocol:** §11 AI Gateway
- **LFCC Protocol:** §5 Stable Anchors
- **OWASP Top 10:** Web application security risks

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-01
