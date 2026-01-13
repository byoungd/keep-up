/**
 * Default Cowork Policy
 *
 * Conservative policy aligned with Cowork folder-scoped access and confirmations.
 */

import type { CoworkPolicyConfig } from "./policy";

export const DEFAULT_COWORK_POLICY: CoworkPolicyConfig = {
  version: "1.0",
  defaults: { fallback: "deny" },
  rules: [
    {
      id: "deny-outside-grants",
      action: "file.*",
      when: { pathWithinGrant: false },
      decision: "deny",
      reason: "path outside grants",
    },
    {
      id: "deny-sensitive-files",
      action: "file.*",
      when: { matchesPattern: ["**/.env*", "**/id_rsa*", "**/secrets/**"] },
      decision: "deny",
      reason: "sensitive file pattern",
    },
    {
      id: "allow-read",
      action: "file.read",
      when: { pathWithinGrant: true },
      decision: "allow",
    },
    {
      id: "allow-write-output",
      action: "file.write",
      when: { pathWithinGrant: true, pathWithinOutputRoot: true },
      decision: "allow",
    },
    {
      id: "confirm-write",
      action: "file.write",
      when: { pathWithinGrant: true, pathWithinOutputRoot: false },
      decision: "allow_with_confirm",
      riskTags: ["overwrite"],
      reason: "write outside output roots",
    },
    {
      id: "confirm-create",
      action: "file.create",
      when: { pathWithinGrant: true, pathWithinOutputRoot: false },
      decision: "allow_with_confirm",
      riskTags: ["overwrite"],
      reason: "create outside output roots",
    },
    {
      id: "confirm-delete",
      action: "file.delete",
      decision: "allow_with_confirm",
      riskTags: ["delete"],
      reason: "delete requires confirmation",
    },
    {
      id: "confirm-rename",
      action: "file.rename",
      decision: "allow_with_confirm",
      riskTags: ["batch"],
      reason: "rename requires confirmation",
    },
    {
      id: "confirm-move",
      action: "file.move",
      decision: "allow_with_confirm",
      riskTags: ["batch"],
      reason: "move requires confirmation",
    },
    {
      id: "deny-network-default",
      action: "network.request",
      decision: "deny",
      reason: "network disabled by default",
    },
    {
      id: "confirm-network-allowlist",
      action: "network.request",
      when: { hostInAllowlist: true },
      decision: "allow_with_confirm",
      riskTags: ["network"],
      reason: "network allowlist",
    },
    {
      id: "allow-connector-read",
      action: "connector.read",
      when: { connectorScopeAllowed: true },
      decision: "allow",
    },
    {
      id: "confirm-connector-action",
      action: "connector.action",
      decision: "allow_with_confirm",
      riskTags: ["connector"],
      reason: "connector action requires confirmation",
    },
  ],
};
