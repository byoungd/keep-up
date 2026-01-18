# KU0 · Keep Up (ku0.com) — Product Requirements Document (PRD)

> [!IMPORTANT]
> **Implementation Active**: This PRD describes the product vision.
> For technical implementation details, refer to the **[Specifications](./specs/README.md)**.
> *   **Agent Runtime**: [`specs/agent-runtime-spec-2026.md`](./specs/agent-runtime-spec-2026.md)
> *   **Cowork App**: [`specs/cowork/cowork-app-spec.md`](./specs/cowork/cowork-app-spec.md)

- **Product:** KU0 · Keep Up
- **Document type:** PRD (official, Markdown)
- **Version:** v1.0
- **Date:** 2026-01-09
- **Owner:** (fill)
- **Reviewers:** (fill)
- **Status:** Draft for review

---

## 1. Executive Summary

**KU0 · Keep Up** is an **agentic tech-intelligence workspace** that helps individuals and teams stay current with fast-moving technology by converting noisy updates into **high-signal daily/weekly digests** and **collaborative Living Briefs**.

The product is **AI-native** (assistant + commands embedded in the reading/editor experience), powered by an **agents-runtime** and a **plugin mechanism**. KU0 additionally supports:
- **BYOK (Bring Your Own Key)** for model provider choice and cost control
- **Parallel multi-LLM execution** for verification/consensus
- **LFCC-based local-first collaborative documents** for “Living Briefs” (team co-editing, offline-first, deterministic merging)

**Immediate focus (per latest audit/status):** restore the core reading loop (import persistence + Reader entry + Topics/Projects routes), ship an **RSS-driven Digest MVP**, and **upgrade AIPanel to an Open Cowork Wrapper** (wrapping *any* AI provider with Project-aware, Agentic, and Artifact-driven capabilities).

---

## 2. Background & Context

### 2.1 Why this product exists
Technical users face:
- High-volume, redundant updates (releases, papers, blogs, community discussions)
- Low trust in “AI summaries” without citations
- Lack of a durable place to turn updates into actionable team knowledge

### 2.2 Product narrative
**Keep Up** is the flagship use-case:
> “Give me the most important changes for my stack, explain why they matter, show sources, and help my team turn them into decisions.”

---

## 3. Goals, Non-Goals, and Success Metrics

### 3.1 Goals (MVP → v1)
1. **Restore the core loop:** ingest → persist → read → organize → export, with no broken routes.
2. **Ship Daily/Weekly Digest MVP:** high-signal summaries from RSS/URL ingestion with evidence links/citations.
3. **Enable trust:** enforce grounding (citations) for digest outputs and “Ask KU0” answers.
4. **Enable compounding knowledge:** create and maintain **Living Briefs** (LFCC local-first docs) that agents can update as suggestions.
5. **Establish Open Cowork Paradigm:** shift AIPanel into a **Universal AI Wrapper** that allows users to cowork with *any* AI provider (OpenAI, Anthropic, Local, etc.) within a unified, safe, and context-aware environment.

### 3.2 Non-goals (initial releases)
- Being a general “tech news” portal for everyone.
- Real-time alerting and enterprise integrations on day one (Slack/Notion/Jira write-back can follow).
- Fully automated “trend research” without user oversight (we start with assisted workflows).

### 3.3 Success metrics
**Activation**
- % users who connect ≥1 RSS feed and read ≥1 digest within 24h
- Time-to-first-digest (TTFD)

**Engagement**
- Digest open rate (daily/weekly)
- Avg cards opened per digest
- “Ask KU0” usage per active user

**Trust / Quality**
- % digest cards with valid citations
- Citation click-through rate
- Duplicate rate in digests
- User-rated usefulness (1–5)

**Outcome**
- # items pinned to a Living Brief
- # actions created (checklist/ticket/export) per active user

---

## 4. Target Users & Key Use Cases

### 4.1 Personas
1. **Individual Engineer (AI/Platform/Backend):** wants 5–10 minutes/day to stay current.
2. **Tech Lead / Architect:** wants focused radar/digest + decision support for stack choices.
3. **Engineering Team:** wants collaborative briefs and a shared understanding of what’s changing.

### 4.2 Key use cases (MVP)
- Subscribe to feeds and see new items reliably in Reader.
- Get a daily/weekly digest tailored to chosen topics.
- For each digest item: read “What changed”, “Why it matters”, “Who should care”, and **open evidence**.
- Ask follow-ups grounded in the same evidence.
- Pin high-value items into a Living Brief (single-user initially; team collaboration expands).
- **Assign simple tasks to AI:** "Check the latest breaking changes in Next.js and update our migration plan" (requires web search + doc reading + plan update).

---

## 5. Product Principles

1. **Evidence-first:** no factual claim without sources; show confidence and uncertainty.
2. **Noise-killing:** prioritize relevance + dedupe + quality gating.
3. **Action loop:** turn insights into next steps (try, adopt, monitor, ignore).
4. **User control:** BYOK, budgets, lane selection (fast/deep/consensus).
5. **Local-first ownership:** briefs are durable artifacts owned by the user/team.

---

## 6. Current Status (As-of 2026-01-09)

### 6.1 Confirmed implemented capabilities (status report)
- Web Reader supports import (URL/file/text + RSS), read/edit, AI panel/commands, export (Markdown/HTML/PDF).
- RSS ingestion includes dedupe and quality gating; ImportManager supports queue/retry/state machine.
- agents-runtime supports agent loop + event-driven orchestration and parallel/DAG execution; includes timeouts, concurrency control, retries, rate limiting, caching, telemetry/event bus.
- Plugin framework supports manifest/capabilities/activation and load/unload lifecycle; marketplace/auth/UI are not yet present.
- Known audit blockers: import persistence, Reader entry, Topics/Projects routes, and ungrounded AI outputs (citations not enforced).

### 6.2 Product-owner declared capabilities (to be validated in implementation)
- BYOK support
- Multi-LLM parallel execution for tasks and conversations
- LFCC-based collaborative editing for documents (“Living Briefs”)

> Note: These are **in-scope** for this PRD. Any gaps between “declared” and “implemented” should be surfaced during Week 1 validation.

---

## 7. MVP Scope (Recommended)

### 7.1 MVP: “RSS Digest in Web Reader”
**Why:** Reuses existing RSS ingestion + import UI, and delivers immediate Keep Up value.

**In scope**
- Restore core reading loop reliability (P0)
- RSS subscription management + stable daily intake (P0)
- Daily/weekly digest generation (P0 → P1)
- Citation enforcement for digest (P0)
- Topics/keywords organization (P0/P1)
- “Ask KU0” follow-ups grounded in evidence for digest items (P1)

**Out of scope (MVP)**
- Real-time radar alerts at scale (v1)
- Full plugin marketplace + OAuth management (v1)
- Full RAG/vector search across all history (v1+)
- External write-back integrations beyond local export (v1)

---

## 8. User Experience & Information Architecture

### 8.1 Primary navigation (proposed)
- **Today** (Daily Digest)
- **Library** (Unread/Read, imported items)
- **Topics** (keyword/topic organization)
- **Briefs** (Living Briefs)
- **Ask** (global assistant)
- **Plugins**
- **Settings** (BYOK, model lanes, budgets, privacy)

### 8.2 Onboarding flow (MVP)
1. Choose topics (tags) + time budget (5/10/20 minutes)
2. Add RSS feeds (starter presets recommended)
3. Optional: connect BYOK keys + choose lane defaults
4. Show first digest within 10 minutes (or next scheduled run)

### 8.3 Digest card design (MVP schema)
Each digest card must include:
- **Title**
- **1–2 sentence summary**
- **Why it matters** (1–2 bullets)
- **Who should care** (roles/tags)
- **Evidence** (1–N sources; clickable)
- CTA: **Ask follow-up**, **Pin to Brief**, **Open original**

---

## 9. Functional Requirements (FR) & Acceptance Criteria

### FR1 — Core Loop Reliability (P0)
**Requirement:** Imported content persists and is discoverable; Reader entry and Topics/Projects routes are functional.

**Acceptance criteria**
- Import via URL/text/file/RSS creates a persistent record.
- Imported items appear in the list view within <10s (or after refresh).
- Reader entry route works for at least 95% of items (no 404/blank).
- Topics/Projects routes do not 404 and display basic content.

---

### FR2 — RSS Subscriptions & Stable Ingestion (P0)
**Requirement:** Users can add RSS feeds; KU0 ingests new items on schedule.

**Acceptance criteria**
- Feed add/remove/edit works; duplicates prevented.
- Ingestion dedupes within-feed and across feeds.
- Quality gate reports pass/warn/fail; failed items do not enter digest by default.
- After connecting ≥10 technical feeds, KU0 ingests ≥20 items/day (target) in a stable environment.

---

### FR3 — Digest Generation (Daily/Weekly) (P0 → P1)
**Requirement:** KU0 generates digests from ingested items.

**Acceptance criteria**
- Daily digest contains 7–12 cards by default, configurable by time budget.
- Weekly digest aggregates and de-duplicates the week’s clusters.
- Digest supports filtering by Topics.
- Digest supports “pin to brief”.

---

### FR4 — Grounded Output & Citations (P0)
**Requirement:** Digest summaries must be grounded in evidence; AI must not output unsupported factual claims.

**Acceptance criteria**
- Each digest card includes ≥1 citation (source link + snippet or anchor).
- If citations cannot be produced, the card is either (a) excluded or (b) labeled “Low confidence” with explicit missing evidence.
- “Ask follow-up” answers must show cited sources used.

---

### FR5 — Topics / Keywords Organization (P0/P1)
**Requirement:** Users can create Topics and associate items.

**Acceptance criteria**
- Create/edit/delete Topics.
- Associate items (manual pin, and basic auto-suggest via keywords).
- Digest can be generated “by Topic” (at least 1 Topic page with digest slice).

---

### FR6 — Ask KU0 (Evidence-grounded Q&A) (P1)
**Requirement:** Users can query their digest/library and get grounded answers.

**Acceptance criteria**
- Answers cite sources (at least from ingested content).
- Supports “compare” questions (e.g., framework A vs B) with explicit evidence.
- Safe failure: “Unknown / insufficient evidence” response if needed.

---

### FR7 — Model Independence (Open Wrap) (P1)
**Requirement:** Users can plug *any* AI provider (cloud or local) into the Cowork environment. Keep Up acts as the "Open Wrapper" providing the context, tools, and UI around the raw model.

**Acceptance criteria**
- Add/remove keys; encrypted storage at rest.
- Provider selection per lane (fast/deep/consensus).
- Token/cost estimation display per run (best-effort).
- Org policy: optional disabling of server-side key storage (roadmap).

---

### FR8 — Multi-LLM Parallelism & Consensus Lane (P1)
**Requirement:** Support running multiple LLMs in parallel for verification/consensus.

**Acceptance criteria**
- Consensus lane runs 2–3 models and produces:
  - **Common points**
  - **Disagreements**
  - **Evidence mapping** (which source supports which claim)
- UI allows switching lanes per task (default from settings).

---

### FR9 — Living Briefs via LFCC (P1 → v1)
**Requirement:** Users maintain collaborative “Living Briefs” that can be updated by agents as suggestions.

**Acceptance criteria**
- Create a brief from template (Tool Eval / Tech Topic / ADR).
- Offline-first editing; eventual sync.
- Agent updates are applied as **suggestions**, not silent edits.
- Each suggestion records provenance: agent + model + timestamp + evidence.

---

### FR10 — Cowork (AI Partner) (P1)
**Requirement:** The application wraps the chosen AI model to provide "Partner" capabilities (context, memory, autonomy) regardless of the underlying provider.

**Acceptance criteria**
- **Project Awareness (Memory):** AI can read and understand `docs/tasks/*.md` and global project structure. Conversations persist and build upon previous decisions.
- **Autonomy (Agent Runtime):** AI can execute tools (read files, search codebase, run commands) to complete closed-loop tasks, subject to user "Approval" UI.
- **Artifact-based Collaboration:** AI communicates via structured **Artifacts** (Plans, Checklists, Drafts) that render as interactive UI cards, not just text blocks.
- **Task Management:** AI can update the status of items in `task.md` as it completes work.

---

## 10. System Design Overview (Product-level)

### 10.1 Agent pipeline (high level)
1. **Scout** (plugins fetch)
2. **Normalize** (metadata + extracted content)
3. **Deduplicate / Cluster** (minimum: within RSS; later: cross-source semantic clustering)
4. **Rank** (relevance, freshness, authority, personal relevance)
5. **Verify** (citations; enforce evidence)
6. **Synthesize** (digest cards; brief updates)
7. **Publish** (digest view; brief doc updates; exports)

### 10.2 Plugin types
- **Source plugins:** RSS, URL ingest (including GitHub raw), file ingest, (later) web search, YouTube (flagged)
- **Action plugins:** export (local), (later) Slack/Notion/Jira/GitHub issues

### 10.3 Data objects (minimum)
- `IngestionMeta`: title/content/sourceId + quality signals
- `ContentResult`: textContent / CRDT update / metadata
- `DigestCard`: summary/why/evidence/topics/scores
- `Topic`
- `LivingBrief` (LFCC doc)
- `EvidenceAnchor` (citation anchoring)

---

## 11. Quality, Safety, and Trust

### 11.1 Quality bar
- No digest without citations
- Deduplication prevents “same story repeated”
- Clear separation of:
  - **facts** (cited)
  - **interpretations** (labeled)
  - **speculation** (explicitly marked)

### 11.2 Safety & abuse considerations
- Plugin permission prompts for action plugins
- BYOK key handling and audit logs
- Rate limiting and content source health scores

---

## 12. Instrumentation & Analytics (MVP requirement)
Track at minimum:
- Import success/failure reasons
- Feed health and ingestion stats
- Digest generation runtime and cost
- Citation coverage
- User engagement and feedback signals

---

## 13. Rollout Plan (Aligned to 2–4 Week Recommendation)

### Week 1 — Restore core loop (P0)
- Fix import persistence and list refresh
- Restore Reader entry and key routes (Topics/Projects)
- Validate BYOK / multi-LLM / LFCC claims vs implementation

**Exit criteria**
- “Critical user journey” passes end-to-end (import → list → open → read/edit → AI panel → export)

### Week 2 — RSS subscriptions & stable intake (P0)
- Subscription management UX
- Improve feed dedupe + quality report visibility
- Ensure stable daily ingestion

**Exit criteria**
- After adding feeds, ≥20 new items/day appear reliably

### Week 3 — Digest v0 with citations (P0 → P1)
- Daily digest page inside Reader
- Digest card schema + references
- Grounded synthesis enforcement

**Exit criteria**
- Digest card can jump to cited source passage (anchor/snippet)

### Week 4 — Topics/keywords aggregation + basic ranking (P1)
- Topic creation + association
- Topic-scoped digest
- Basic ranking improvements

**Exit criteria**
- User creates a Topic and sees a Topic digest slice with citations

---

## 14. Risks & Mitigations

1. **Core loop instability blocks everything (P0)**
   - Mitigation: Week 1 as a reliability sprint with hard acceptance tests.

2. **Ungrounded AI output reduces trust (P0)**
   - Mitigation: citation enforcement + fail-closed behavior for digest.

3. **No clustering/trends reduces differentiation (P1)**
   - Mitigation: ship digest first; add lightweight clustering after citations.

4. **Cost blow-ups**
   - Mitigation: model lanes + budgets + caching + fast/deep split.

5. **Plugin security + auth complexity**
   - Mitigation: start with source-only + local export; add OAuth/marketplace later.

---

## 15. Open Questions / Decisions Needed

1. **MVP audience:** individual engineers first vs team leads first?
2. **Starter feeds:** curated default list by domain (AI infra, cloud native, security, frontend)?
3. **Digest cadence:** daily only, or daily + weekly from day one?
4. **Consensus UX:** how to present disagreements without confusing users?
5. **Living Brief templates:** which 3 templates ship first (Tool Eval / Tech Radar Topic / ADR)?

---

## 16. Appendix

### 16.1 Glossary
- **BYOK:** Bring Your Own Key (user supplies model keys)
- **LFCC:** Local-First Collaboration Contract (collaborative editing rules)
- **Living Brief:** a long-lived doc that aggregates and evolves a topic’s knowledge

### 16.2 Evidence sources for this PRD
- “KU0 (Keep Up) product status report” dated 2026-01-09 (audits + code pointers)
- Product-owner inputs: BYOK, multi-LLM parallelism, LFCC integration
