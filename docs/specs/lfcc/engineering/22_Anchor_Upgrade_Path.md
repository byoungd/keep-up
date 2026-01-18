# Anchor Upgrade Path - CRC32 to HMAC-SHA256 (Design)

**Applies to:** LFCC v0.9 RC (design input for v1.0)
**Last updated:** 2026-01-01
**Audience:** Protocol architects, security engineers
**Status:** Design proposal (non-normative)

---

## 0. Summary

This document describes a forward-looking path to move anchor integrity from CRC32 to HMAC-SHA256.
It focuses on negotiation, mixed-version coexistence, and key rotation. Implementation is targeted for v1.0.

---

## 1. Goals

- Stronger integrity checks to detect intentional tampering.
- Mixed-version clients can collaborate without breaking anchor validation.
- Algorithm and key rotation without invalidating stored anchors.
- Minimal changes for anchor consumers and storage.

## 2. Non-goals

- Defining a key distribution mechanism or trust model.
- Changing annotation storage models or UI behavior.
- Providing performance benchmarks for the new encoding.

---

## 3. Current Baseline (v0.9)

- Anchor encoding is versioned and includes a CRC32 checksum.
- Negotiation requires an exact match for `anchor_encoding.version`.
- Decoders reject invalid checksums (fail-closed).

---

## 4. Proposed v1.0 Anchor Encoding v2

### 4.1 Payload format (conceptual)

```
[version][alg_id][key_id][anchor_payload][mac]
```

- `version`: 1 byte, set to 2.
- `alg_id`: 1 byte identifier (example: 1 = crc32, 2 = hmac-sha256).
- `key_id`: fixed length or varint identifier for key lookup.
- `mac`: HMAC-SHA256 over version + alg_id + key_id + payload, truncated to N bytes (default 16).

### 4.2 Policy manifest additions (v1.0)

- `anchor_encoding.version`: set to `v2`.
- `anchor_encoding.integrity`: `{ algorithm: "hmac-sha256", mac_length: 16 }`.
- `anchor_encoding.key_id`: active key identifier.
- `extensions.anchor_encoding.supported`: ordered list of supported encodings for negotiation.

---

## 5. Mixed-version coexistence and negotiation

- Peers advertise supported anchor encodings via `extensions.anchor_encoding.supported`.
- Negotiation selects the strongest common encoding, with CRC32 as fallback when older peers are present.
- If there is no overlap, the session fails closed.
- Encoders emit anchors in the negotiated encoding; decoders validate only that encoding to keep deterministic behavior.

---

## 6. Migration and re-encode strategy

- Phase 0: all peers are v0.9, CRC32 only.
- Phase 1: v1.0-capable peers join; negotiation still selects CRC32.
- Phase 2: once all peers support v2, negotiation selects HMAC and anchors are re-encoded in bulk or on touch.
- Phase 3: deprecate CRC32 after a grace window and cleanup legacy anchors.

---

## 7. Key management and rotation

- Keys are identified by `key_id` and distributed out of band.
- Clients keep an active key and a grace set of previous keys for verification.
- Rotation flow:
  1) distribute a new key and update session config with the new `key_id`.
  2) start dual-verify using active + grace keys.
  3) emit new anchors with the new `key_id`.
  4) retire old keys after `grace_period_ms` and once anchors are re-encoded.

---

## 8. Algorithm agility

- `alg_id` allows future algorithms without changing the container layout.
- Negotiation prefers the strongest algorithm in the intersection and documents downgrade rules.

---

## 9. Open questions

- What is the recommended key distribution channel for local-first groups?
- Should anchors temporarily store both CRC32 and HMAC during transition, or rely on negotiated single encoding?
- Should `mac_length` be fixed or negotiable?
