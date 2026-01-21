#!/usr/bin/env markdown
# Computer Use Safety and Multimodal Artifacts (v1)

Status: Implemented  
Owner: Agent Runtime  
Last Updated: 2026-02-15  
Applies to: Agent Runtime v1  
Related docs: `docs/roadmap/phase-3-graph/track-w-computer-use.md`, `docs/specs/cowork/cowork-safety-spec.md`

## Context
Computer-use workflows introduce OS-level screen capture and input control. These actions are
high-risk compared to standard file or network tools, so the runtime enforces explicit permission
levels, confirmation gates, and auditable artifacts for multimodal outputs.

## Goals
- Provide a standard computer-use tool surface (screen, pointer, keyboard).
- Enforce explicit permission levels with confirmations for risky actions.
- Store image outputs as artifacts with size limits and durable references.
- Persist streaming events for audit and replay.

## Non-Goals
- OS-specific input drivers or UI automation (handled by controller adapters).
- UI rendering of artifacts (handled by Cowork app).

## Tool Catalog
Computer tools are exposed under the `computer` namespace:
- `computer:screenshot`
- `computer:pointer_move`
- `computer:click`
- `computer:keypress`
- `computer:type`

Tool schemas follow MCP conventions and return structured `ToolContent` responses. Screenshots
return `{ type: "image", data: <base64>, mimeType: "image/png" }` payloads.

## Permissions and Confirmation
Security policies include a `computer` permission with four levels:
- `disabled`: block all computer actions.
- `observe`: allow screen capture only.
- `control`: allow input actions, but require confirmation for input.
- `full`: allow input actions without confirmation.

The permission checker treats input actions (`click`, `pointer_move`, `keypress`, `type`) as
high-risk and tags them with `computer:input` when confirmation is required. The default
security presets are:
- `safe`: `computer: disabled`
- `balanced`: `computer: control`
- `power` / `developer`: `computer: full`

## Streaming Loop and Audit Events
The streaming loop interleaves model output with tool execution. It emits tool start/progress/end
signals and can forward stream events to the runtime event bus via the stream event bridge.
Tool confirmation prompts are surfaced before high-risk actions when required by policy.

## Multimodal Artifacts
Image outputs are stored as `ImageArtifact` records and emitted through the artifact pipeline.
Key behavior:
- Storage root: `.agent-runtime/spool/images/`.
- Default policy: max 5 MB, allowed types `image/png`, `image/jpeg`, `image/webp`.
- Image artifacts include `uri`, `mimeType`, `byteSize`, `contentHash`, and optional tool metadata.

Tool output spooling persists large outputs to disk while returning truncated content. Image
segments inside spooled tool outputs are stored as separate binary files and replaced with
resource references.

## Configuration Examples
Set computer permissions with the policy builder:
```ts
import { securityPolicy } from "@ku0/agent-runtime";

const policy = securityPolicy()
  .withComputerPermission("observe")
  .build();
```

Customize image artifact policy by supplying a store:
```ts
import { createImageArtifactStore, createArtifactPipeline, createArtifactRegistry } from "@ku0/agent-runtime";

const pipeline = createArtifactPipeline({
  registry: createArtifactRegistry(),
});
const imageStore = createImageArtifactStore({
  pipeline,
  policy: { maxBytes: 2 * 1024 * 1024, allowedMimeTypes: ["image/png"] },
});
```

## Operational Notes
- Computer tools are controller-driven; the runtime does not provide OS automation.
- Confirmation handlers should present risk labels and permission escalation reasons.
- Artifact emission failures are quarantined and do not crash the tool execution path.
