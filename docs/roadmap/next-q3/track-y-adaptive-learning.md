# Track Y: Adaptive Learning (Semantic Memory)

> **Owner**: Data Scientist / Backend Engineer
> **Status**: Proposed
> **Priority**: High
> **Timeline**: Month 2-3
> **Dependencies**: Q2 Track P (State/Memory Validation)
> **Parent**: [Q3 Roadmap](./README.md)

---

## Objective

The agent currently resets its personality every session. Track Y introduces "Long-Term Semantic Memory" that persists across sessions/projects. This allows the user to specify preferences ("I hate TypeScript Enums") *once*, and the agent remembers forever.

> [!NOTE]
> This is a **novel capability**. Competitor analysis (see [sota-gap-analysis.md](./sota-gap-analysis.md)) shows CrewAI/MetaGPT have basic memory but **no automatic learning from user feedback**.

---

## Tasks

### Y1: Preference Extraction
- **The "Critic" Agent**: A background process that analyzes User Feedback (Approvals/Rejections).
- **Rule Extraction**: If User says "Change `let` to `const`", the Critic saves a rule: "Prefer `const` over `let`".

### Y2: Vector-Backed Knowledge Store
- **Store**: Use a local vector DB (e.g., LanceDB or SQLite VSS) to store "Lessons".
- **Retrieval**: On every new prompt, query the store for relevant "Lessons" based on the task description.

### Y3: "Personality" Profiles
- Allow switching between Personas (e.g., "Strict Reviewer", "Creative Prototyper") which load different memory subsets.

---

## Deliverables

| Deliverable | Location | Description |
|-------------|----------|-------------|
| `CriticAgent` | `packages/agent-runtime/src/learning/` | Background preference extractor |
| `LessonStore` | `packages/agent-runtime-memory/src/lessons/` | Vector-backed lesson storage |
| `Lesson` schema | `packages/agent-runtime-memory/src/types.ts` | `{trigger, rule, confidence}` |
| Lesson UI | `apps/cowork` | View/Edit learned rules |

---

## Acceptance Criteria

- [ ] User corrects the agent once. In a *new* session, the agent applies the correction proactively.
- [ ] Memory store scales to 1,000+ rules with <50ms retrieval latency.
- [ ] User can manually delete a "bad" learned rule.
- [ ] Lessons are project-scoped by default, with option for global rules.

---

## KPIs (Measured in Track Z)

| Metric | Target | Description |
|--------|--------|-------------|
| Recall Precision@1 | >90% | Top result is relevant |
| Rule Adherence | 100% | Learned rules are followed |
| Noise Filtering | >95% | Irrelevant memories ignored |

---

## Testing

- Unit tests for `MemoryManager` CRUD operations.
- Integration tests for cross-session rule persistence.
- Suggested command: `pnpm --filter @ku0/agent-runtime test -- --grep "memory"`
