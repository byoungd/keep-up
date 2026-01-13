# Cowork Policy DSL (Phase 3)

## Purpose
Define a deterministic policy format for allow, confirm, or deny decisions across file access, network access, and connector actions in Cowork mode.

## Goals
- Enforce least privilege with explicit user grants.
- Default deny for anything outside declared scope.
- Produce auditable, repeatable decisions.
- Keep decisions explainable to users.

## Vocabulary
- Subject: session, task, tool, connector, subagent.
- Resource: file path, network host, connector object.
- Action: read, write, create, delete, rename, move, network.request, connector.action.
- Outcome: allow, allow_with_confirm, deny.
- Risk tags: delete, overwrite, network, connector, batch.

## Evaluation Pipeline
1. Normalize inputs (path canonicalization, host parsing, size checks).
2. Apply grant scope checks (folder roots, connector scopes).
3. Assign risk tags based on action intent.
4. Evaluate rules in order (first match wins).
5. Produce decision with reason and required confirmation.
6. Log decision for audit and task summary.

## Decision Matrix (Defaults)
| Action | Default Outcome | Notes |
| --- | --- | --- |
| file.read | allow | Only within folder grants |
| file.write | allow_with_confirm | Confirm if outside outputRoots |
| file.create | allow_with_confirm | Confirm unless in outputRoots |
| file.delete | allow_with_confirm | Always confirm |
| file.rename | allow_with_confirm | Confirm if path changes |
| file.move | allow_with_confirm | Confirm always, deny cross-root |
| network.request | deny | Allow only with explicit grant |
| connector.read | allow | Within connector scopes |
| connector.action | allow_with_confirm | Confirm for mutations |

## DSL Shape (Draft)
```json
{
  "version": "1.0",
  "defaults": {
    "fallback": "deny"
  },
  "rules": [
    {
      "id": "allow-read-in-grants",
      "action": "file.read",
      "when": {
        "pathWithinGrant": true
      },
      "decision": "allow"
    },
    {
      "id": "allow-write-in-output",
      "action": "file.write",
      "when": {
        "pathWithinOutputRoot": true
      },
      "decision": "allow"
    },
    {
      "id": "confirm-write-in-grant",
      "action": "file.write",
      "when": {
        "pathWithinGrant": true,
        "pathWithinOutputRoot": false
      },
      "decision": "allow_with_confirm",
      "riskTags": ["overwrite"]
    },
    {
      "id": "deny-path-escape",
      "action": "file.*",
      "when": {
        "pathWithinGrant": false
      },
      "decision": "deny",
      "reason": "path outside granted roots"
    },
    {
      "id": "deny-secrets",
      "action": "file.*",
      "when": {
        "matchesPattern": ["**/.env*", "**/id_rsa*", "**/secrets/**"]
      },
      "decision": "deny",
      "reason": "sensitive file pattern"
    },
    {
      "id": "confirm-delete",
      "action": "file.delete",
      "decision": "allow_with_confirm",
      "riskTags": ["delete"]
    },
    {
      "id": "deny-network-by-default",
      "action": "network.request",
      "decision": "deny"
    },
    {
      "id": "allow-network-hosts",
      "action": "network.request",
      "when": {
        "hostInAllowlist": true
      },
      "decision": "allow_with_confirm",
      "riskTags": ["network"]
    },
    {
      "id": "confirm-connector-action",
      "action": "connector.action",
      "decision": "allow_with_confirm",
      "riskTags": ["connector"]
    }
  ]
}
```

## Rule Conditions (Draft)
- pathWithinGrant: boolean
- pathWithinOutputRoot: boolean
- matchesPattern: glob list
- fileSizeGreaterThan: number
- hostInAllowlist: boolean
- connectorScopeAllowed: boolean

## Decision Output
```json
{
  "decision": "allow_with_confirm",
  "reason": "file write outside output roots",
  "riskTags": ["overwrite"],
  "requiresConfirmation": true
}
```

## Notes
- Rules should be deterministic and side-effect free.
- Unknown actions should resolve to the fallback decision.
- Confirmations should be surfaced with a concise reason and risk tags.

## Open Questions
- Should policies be static per build, or configurable per workspace?
- How should organization admins override default deny lists?
- Should policy include per-tool rate limits?
