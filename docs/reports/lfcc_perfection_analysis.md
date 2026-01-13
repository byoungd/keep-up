# LFCC Perfection Analysis: Appendix A-D Critique

**Objective:** Identify and eliminate "deep water" gaps in LFCC v0.9.2 RC to reach v1.0 standard.

---

## 1. Appendix B (Sanitization): The Image/Video Gap

### Issue: Over-restrictive Attribute Whitelist
In §B.2, the whitelist only allows `href`, `language`, `rowspan`, and `colspan`. 
- **Critical Failure:** It implicitly bans `src`, `alt`, `title`, `width`, and `height` for `image` blocks.
- **Result:** Images cannot be rendered or transferred safely, breaking a core product requirement. 
- **Security Logic:** The current spec relies on a *whitelist* (good), but the list is incomplete for standard rich-text features.

### Recommendation
Update §B.2 to include:
- `image`: `src`, `alt`, `title`, `width`, `height`
- `video`: `src`, `poster`, `controls`
- All `src`/`poster` attributes MUST pass the §B.3 URL policy.

---

## 2. Appendix A (Checksums): The Control Character Determinism Risk

### Issue: NFC is Not Enough
§A.1 requires NFC normalization and LF conversion. However:
- **Critical Failure:** It does not explicitly strip non-printable C0/C1 control characters (e.g., `U+0000` to `U+001F`, except Tab/LF).
- **Result:** Different editor implementations (or LLMs) might inject null bytes or biomedical control codes. These are "invisible" but change the checksum, causing "Fake Mismatches" that trigger expensive resyncs.

### Recommendation
Add a normative text cleaning rule to §A.1:
> "Implementations MUST strip all C0 and C1 control characters (U+0000–U+001F, U+0080–U+009F) EXCEPT U+0009 (Tab) and U+000A (LF) before computing any digest."

---

## 3. Appendix D (Storage): Compression Ambiguity

### Issue: Opaque Payload vs. Envelope Compression
The spec defines a `payload` field but is silent on whether compression happens *inside* the payload or on the *entire* envelope.

### Recommendation
Clarify in §D.2:
- The `payload` MUST contain uncompressed bytes (or base64 of uncompressed bytes).
- The `checksum` is calculated on the uncompressed payload.
- Compression is a "Layer 4" concern (Transport/Storage) and should be applied to the *entire* JSON-serialized envelope, NOT internally.

---

## 4. Appendix C (Telemetry): Missing Recovery Success Codes

### Issue: Silent vs. Loud Recovery
Currently, we only have failure codes. We lack observability for "The protocol caught a drift and fixed it."

### Recommendation
Add to §C.2:
- `INTEGRITY_RECOVERED_SILENTLY`: Small drift fixed via incremental reconcile.
- `INTEGRITY_RECOVERED_FULL_RESYNC`: Large drift required a hard reset.

---

## 5. Implementation Divergence Warning

### Validation/Sanitizer Strategy
The bridge's current `validator.ts` uses a **blacklist** approach.
> [!WARNING]
> This is a violation of §2.1 and Appendix B. To reach v1.0, the bridge MUST switch to a **strict whitelist** sanitizer.

---

## Summary of Changes for v0.9.3
1. **Appendix B:** Explicit media attribute whitelist.
2. **Appendix A:** Normative C0/C1 stripping.
3. **Appendix D:** Compression/Checksum ordering logic.
4. **Appendix C:** Success telemetry codes.
