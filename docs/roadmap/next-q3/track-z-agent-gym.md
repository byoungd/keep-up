# Track Z: Agent Gym (Quality Assurance & Metrics)

> **Owner**: QA Engineer
> **Status**: Proposed
> **Priority**: High
> **Timeline**: Month 3
> **Dependencies**: Track X, Track Y
> **Parent**: [Q3 Roadmap](./README.md)

---

## Objective

To prove `Keep-Up` is a "Top-Tier" agent, we cannot rely on vibes. We must establish **hard, quantifiable metrics** for each core cognitive module. Track Z builds the infrastructure (`KeepUpGym`) to measure these KPIs continuously in CI.

> [!IMPORTANT]
> This is a **unique capability**. No competitor framework has CI-driven cognitive regression testing.

---

## Module-Specific Metrics (The "Report Card")

We will measure specific Key Performance Indicators (KPIs) for each core capability.

### 1. Perception Metrics (Track X - LSP)
*Goal: Does the agent "see" the code correctly?*

| Metric | Target | Description |
|--------|--------|-------------|
| Symbol Resolution Rate | >95% | Correct class/function location |
| Reference Accuracy | 100% | Must match IDE |
| Hallucination Rate | <1% | No invented methods |

### 2. Memory Metrics (Track Y - Adaptive Learning)
*Goal: Does the agent "learn" over time?*

| Metric | Target | Description |
|--------|--------|-------------|
| Recall Precision@1 | >90% | Top result is relevant |
| Rule Adherence | 100% | Learned rules are followed |
| Noise Filtering | >95% | Irrelevant memories ignored |

### 3. Planning Metrics (Runtime)
*Goal: Is the agent efficient and robust?*

| Metric | Target | Description |
|--------|--------|-------------|
| Step Efficiency | <5 steps | For standard "Easy" tasks |
| Error Recovery Rate | >80% | Self-fix syntax errors |
| Cost Per Task | Baseline | Token cost tracking |

---

## Tasks

### Z1: The Gym Framework (Infrastructure)
- **Harness**: A runner that spins up a fresh `agent-runtime`, mocks the filesystem, and executes a user prompt.
- **Scoring Engine**: Automated evaluators that run after the agent finishes (e.g., "Did the file compile?", "Did the linter pass?").

### Z2: Challenge Dataset (The "Exam")
Create 50+ deterministic scenarios covering:

| Category | Count | Tests |
|----------|-------|-------|
| Syntax Repair | 10 | Error Recovery |
| Refactoring | 15 | Perception & Safety |
| Feature Add | 15 | Planning & Memory |
| Cross-File | 10 | Dependency Awareness |

### Z3: CI/CD "IQ Gate"
- Integrate `KeepUpGym` into GitHub Actions.
- **Block Merges** if the "Aggregate IQ Score" drops.
- Generate a visual report: "Perception +5%, Memory -2%".

---

## Deliverables

| Deliverable | Location | Description |
|-------------|----------|-------------|
| `agent-gym` package | `packages/agent-gym/` | Test harness and runner |
| Benchmarks | `packages/agent-gym/benchmarks/` | 50+ challenge scenarios |
| Metric Dashboard | `apps/cowork` (dev settings) | IQ visualization |
| CI Workflow | `.github/workflows/gym.yml` | Automated IQ gate |

---

## Acceptance Criteria

- [ ] Perception KPI: Agent finds symbols with >95% accuracy in the benchmark.
- [ ] Memory KPI: Agent respects user preferences in 10/10 test cases.
- [ ] Safety KPI: Agent never (0%) writes outside the allowed sandbox.
- [ ] CI pipeline runs the "Easy" suite in <5 minutes.
- [ ] Regression is detected when the Model or Prompt changes.

---

## Testing

- Unit tests for scoring engine accuracy.
- Integration tests for harness reliability.
- Suggested command: `pnpm --filter @ku0/agent-gym test`
