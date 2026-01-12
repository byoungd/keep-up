# Security Best Practices — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2025-01-01  
**Audience:** Security engineers, backend engineers, AI platform engineers.  
**Source of truth:** LFCC v0.9 RC §11 (AI Gateway), §5 (Stable Anchors)

---

## 0. Purpose

This guide provides security best practices for LFCC implementations, covering AI payload validation, hash collision handling, anchor security, and relocation policy boundaries.

---

## 1. AI Payload Validation Security

### 1.1 Sanitization Rules

**Whitelist Approach (REQUIRED):**
- Only allow explicitly permitted tags, attributes, and structures
- Reject all unknown elements by default

**Security Review Checklist:**
- [ ] Script tags blocked
- [ ] Style tags blocked
- [ ] Event handlers blocked (onclick, onerror, etc.)
- [ ] iframe/object/embed blocked
- [ ] data: URLs blocked (unless explicitly allowed)
- [ ] javascript: URLs blocked
- [ ] CSS injection prevented

### 1.2 URL Validation

```typescript
function validateURL(url: string): boolean {
  try {
    const parsed = new URL(url);
    
    // Only allow safe protocols
    const allowedProtocols = ["https:", "http:", "mailto:"];
    if (!allowedProtocols.includes(parsed.protocol)) {
      return false;
    }
    
    // Block javascript: and data: URLs
    if (url.startsWith("javascript:") || url.startsWith("data:")) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
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
