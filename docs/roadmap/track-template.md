# Track <ID>: <Title>

> Priority: <P0|P1|P2|P3>
> Status: <Proposed|Ready|Approved|Active|Completed>
> Owner: <Team/Owner>
> Dependencies: <List key dependencies>
> Source: <Link to roadmap phase or related spec>

---

## Objective

<What this track delivers and why it exists.>

---

## Scope

- <In-scope deliverable or feature>
- <In-scope deliverable or feature>

---

## Out of Scope

- <Explicitly excluded area>
- <Explicitly excluded area>

---

## Implementation Spec (Executable)

1) <Step name>
- <Exact steps>
- <Exact steps>

2) <Step name>
- <Exact steps>

---

## Deliverables

- <Concrete outputs: modules, APIs, docs, tests>

---

## Acceptance Criteria

- <Measurable success criterion>
- <Measurable success criterion>

---

## Validation

- <Command or procedure>
- <Command or procedure>

---

## Single-Doc Execution Checklist

1) Create feature branch
- git fetch origin
- git checkout main
- git pull --ff-only
- git checkout -b feat/track-<id>-<short-name>

2) Initialize required artifacts
- task.md: add checklist items from this track
- implementation_plan.md: summarize steps and dependencies
- walkthrough.md: add validation steps and test commands

3) Implement the scope
- Follow the Implementation Spec in this document only
- Keep changes minimal and within scope

4) Validate
- Run the commands listed under Validation in this document
- Run: pnpm biome check --write

5) Commit and PR
- git add -A
- git commit -m "feat: <track-id> <summary>"
- git push -u origin feat/track-<id>-<short-name>
- Open PR with the template below

### PR Template
- What changed and why
- Tests: <command(s)> or "Not run (docs-only)"
- Risks/known issues
- Spec sections satisfied (list exact headings)
