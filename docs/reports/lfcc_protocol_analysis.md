# LFCC Protocol Analysis: Roadmap to v1.0

**Status:** Critical Gap Analysis (Pre-v1.0)
**Scope:** Identifying blocking requirements for v1.0 stability based on `LFCC_v0.9_RC` spec vs. `lfcc-bridge` reference implementation.

## 1. Executive Summary

LFCC v0.9 RC provides a robust foundation for local-first collaboration but **fails to meet v1.0 stability requirements** due to "Loose Validation" in three critical areas: **Integrity Verification**, **AI Safety**, and **Operational Telemetry**.

While the reference implementation (`lfcc-bridge`) functions correctly, it relies on implicit "de facto" standards (e.g., specific checksum algorithms, regex whitelists) that are not normatively defined in the protocol. This creates a risk where independent implementations (e.g., a Rust backend vs. a JS client) will fail to converge or constantly report false-positive divergence.

To reach v1.0, these implicit behaviors must be elevated to **Normative Standards**.

---

## 2. Gap Analysis: Determinism & Conformance

**The Problem:** The Spec requires "Integrity Verification" but does not define *how* to compute the checksums.
**Current State (`lfcc-bridge/src/integrity/divergence.ts`):** Implements a bespoke "Two-Tier Checksum" system.

### Gap 2.1: Undefined Checksum Algorithm
The spec mentions `context_hash` but leaves document-wide verification open.
- **Risk:** Client A computes hash as `sha256(text)`, Client B as `sha256(text + marks)`. They will never agree on "Synced" state.
- **Requirement for 1.0:** Normatively define the **Canonical Checksum Algorithm**:
    1.  **Scope:** Must include Block Order, Text Content, Active Marks, and Block Attributes.
    2.  **Algorithm:**
        ```text
        Checksum = Hash(
           Sort(Blocks by ID).map(b =>
               Hash(b.id + b.type + b.attrs + b.text + Sort(b.marks))
           ).join("|")
        )
        ```
    3.  **Efficiency:** Adopt the **Two-Tier Strategy** (O(1) superficial vs O(N) deep) as a *client requirement*.

### Gap 2.2: Frontier vs. Vector Clocks
The report notes "Timestamp determinism gaps".
- **Risk:** "Last Write Wins" based on wall-clock time is insufficient for high-concurrency partial offline modes.
- **Requirement for 1.0:** Mandate **Logical Vector Clocks** (Lamport + Actor ID) for all structural operations to banish "wall clock" from conflict resolution entirely.

---

## 3. Gap Analysis: Security & AI Safety

**The Problem:** The Spec requires "Sanitization" but leaves the specific rules up to policy, leading to uneven safety surfaces.
**Current State (`lfcc-bridge/src/security/validator.ts`):** Uses specific, hard-coded regexes and limits.

### Gap 3.1: Non-Normative Sanitization Rules
- **Risk:** One implementation allows `<script>` in attributes, another doesn't. Shared documents become attack vectors.
- **Requirement for 1.0:** Define the **Normative Safety Profile**:
    - **Attribute Whitelist:** Explicit list of allowed attributes per element.
    - **URL Regex:** Standardized regex for `http|https|mailto`.
    - **Forbidden Patterns:** Explicit ban on `javascript:`, `data:` (except images if policy allows), and `vbscript:`.
    - **Recursion Limits:** Hard cap on nesting depth (Recommended: 100).

### Gap 3.2: AI Payload "Dry-Run" Specifics
- **Risk:** AI generates valid HTML that breaks the Editor's specific schema (e.g., "Table inside Heading").
- **Requirement for 1.0:** The **Dry-Run Pipeline** must be a protocol phase:
    1.  `Sanitize(Input)` -> `SafeHTML`
    2.  `Normalize(SafeHTML)` -> `CanonicalTree`
    3.  `SchemaValidate(CanonicalTree)` -> `Accepted | Rejected`
    *Any rejection must fail-closed with 409 Conflict.*

---

## 4. Gap Analysis: Operational Interoperability

**The Problem:** Negotiation is specified, but failure modes are opaque, making cross-implementation debugging impossible.
**Current State (`lfcc-bridge/src/sync/collabManager.ts`):** Emits generic errors.

### Gap 4.1: Standardized Error Codes
- **Risk:** A client disconnects during handshake. Server logs "Connection Closed". Root cause (e.g., "Anchor Version Mismatch") is lost.
- **Requirement for 1.0:** Define **Standard Telemetry Events**:
    - `NEGOTIATION_FAILED_CAPABILITY_MISMATCH`
    - `NEGOTIATION_FAILED_VERSION_INCOMPATIBLE`
    - `INTEGRITY_CHECK_FAILED_HASH_MISMATCH`
    - `AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION`

### Gap 4.2: Storage Envelope Versioning
- **Risk:** Persisted state has no version stamp. A v1.0 client reads a v0.9 file and potentially corrupts it.
- **Requirement for 1.0:** Mandate a **Storage Envelope**:
    ```json
    {
      "lfcc_storage_ver": "1.0",
      "payload": { ... },
      "checksum": "sha256(...)"
    }
    ```

---

## 5. Roadmap to v1.0

To claim v1.0 status, the following actions MUST be taken:

1.  **Spec Patch:** Update `LFCC_v0.9_RC.md` to include:
    - [ ] **Appendix A:** Canonical Checksum Algorithm (pseudocode).
    - [ ] **Appendix B:** Standard Sanitization Regexes.
    - [ ] **Appendix C:** Standard Error Codes.
2.  **Conformance Kit Upgrade:**
    - [ ] Add "Cross-Implementation Hash Test": Verify that the reference implementation's hash matches the spec's algorithm exactly.
3.  **Reference Implementation Update:**
    - [ ] Refactor `divergence.ts` to strictly follow the new Appendix A.
    - [ ] Instrument `collabManager.ts` to emit Appendix C error codes.

**Conclusion:** LFCC is feature-complete but **specification-incomplete**. Closing these definition gaps is the only path to a stable v1.0.
