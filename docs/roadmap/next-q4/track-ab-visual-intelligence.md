# Track AB: Visual Intelligence and Layout Graph

Owner: Applied ML Engineer
Status: Ready
Priority: High
Timeline: Month 2-3
Dependencies: Q3 LSP Perception, Computer-use tooling, Design system tokens
References: .tmp/analysis/open-interpreter/interpreter/core/respond.py, .tmp/analysis/cline/README.md

---

## Objective

Give the agent a visual sense layer that can parse UI layout, compute visual
changes, and map screen regions to code. This enables reliable UI changes,
visual regression detection, and document understanding.

---

## Source Analysis

- Open Interpreter demonstrates a tight loop between LLM output and local
  execution for visual tasks: `.tmp/analysis/open-interpreter/interpreter/core/respond.py`.
- Cline highlights UI-driven workflows and computer-use flows for verification:
  `.tmp/analysis/cline/README.md`.

---

## Tasks

### AB1: Layout Graph Pipeline
- Build a LayoutGraph that combines screenshot regions, DOM nodes, and
  semantic labels.
- Support OCR, bounding boxes, and element role classification.
- Store layout snapshots as artifacts and reference them from checkpoints.

### AB2: Visual Diff and Scoring
- Implement a visual diff engine with region-level change scoring.
- Produce hotspots for review and automated acceptance gates.
- Integrate diff results into KeepUpGym metrics.

### AB3: Screen to Code Mapping
- Map screen regions to component definitions and file locations.
- Provide tools for "select region and edit" workflows.
- Emit mapping confidence and require fallback review if below threshold.

---

## Data Model (Authoritative)

LayoutGraph payload (artifact type `LayoutGraph`, version `1`):
- `nodes`: array of
  - `id`
  - `type`: `text` | `image` | `control` | `container`
  - `bounds`: `{ x, y, width, height }`
  - `text` (optional)
  - `role` (optional)
  - `componentRef` (optional): `{ filePath, symbol, line, column }`
  - `confidence` (0..1)
- `edges`: array of `{ from, to, type }`, where `type` is `contains` | `adjacent`

Visual diff payload (artifact type `VisualDiffReport`, version `1`):
- `regions`: array of `{ id, bounds, score, changeType }`
- `summary`: `{ totalRegions, changedRegions, maxScore }`

Coordinate system:
- `bounds` are pixel coordinates relative to the top-left of the captured image.
- `x`, `y`, `width`, `height` are integers.

Change types:
- `added` | `removed` | `modified`

---

## Mapping Thresholds

- Auto-apply edits only when `confidence >= 0.85`.
- Below 0.85, require manual confirmation before editing.

---

## Configuration Surface

Add `VisionConfig` to `packages/agent-runtime-core/src/index.ts`:
- `autoApplyConfidenceThreshold` (default 0.85)
- `maxScreenshotWidth` (default 1920)
- `maxScreenshotHeight` (default 1080)
- `ocrEnabled` (default true)

---

## Deliverables

- `packages/agent-runtime-vision/` with LayoutGraph and visual diff utilities.
- `packages/agent-runtime-tools/` additions: `layout_scan`, `visual_diff`, `map_region`.
- UI support in Cowork for layout overlays and diff inspection.
- `packages/agent-runtime-core/src/index.ts` additions for `LayoutGraph` and `VisualDiffReport` artifact types.
- Artifact schemas registered in `packages/agent-runtime/src/artifacts/`.
- `packages/agent-gym/benchmarks/q4/` scenarios tagged `visual-layout` and `visual-diff`.

---

## Scope and Non-Goals

In scope:
- Static layout analysis from screenshots and DOM snapshots.
- Visual diff scoring for regression detection.

Not in scope:
- Real-time video understanding or audio input.
- End-to-end design generation from sketches.

---

## Acceptance Criteria

- LayoutGraph is generated for the Q4 visual-layout benchmark fixtures in under 200ms P95.
- Visual diff identifies region changes with less than 1 percent false positives on the Q4 visual-diff fixtures.
- Region to code mapping resolves to file and symbol with over 90 percent accuracy on benchmark fixtures.

---

## Integration Points

- `packages/tool-lsp/` for symbol mapping.
- `packages/agent-runtime-tools/` tool registration and permission gating.
- `apps/cowork/` overlays and diff review UI.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| False positives on diffs | Flaky gating | Golden baselines and thresholds |
| Sensitive UI data | Privacy exposure | Redaction and scoped capture |
| Slow layout parsing | Latency | Caching and incremental updates |

---

## Testing

- Unit tests for LayoutGraph construction and region labeling.
- Integration tests for diff scoring and mapping accuracy.
- Runtime tests: `pnpm --filter @ku0/agent-runtime-vision test -- --grep "layout"`.
- Gym suites: `pnpm --filter @ku0/agent-gym gym:run -- --suite easy --category visual-layout --benchmarks packages/agent-gym/benchmarks/q4 --report packages/agent-gym/reports/q4-visual-layout.json`.
- Visual diff suite: `pnpm --filter @ku0/agent-gym gym:run -- --suite easy --category visual-diff --benchmarks packages/agent-gym/benchmarks/q4 --report packages/agent-gym/reports/q4-visual-diff.json`.
