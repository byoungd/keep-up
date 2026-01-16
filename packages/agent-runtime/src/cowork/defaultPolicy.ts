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
      id: "allow-write",
      action: "file.write",
      when: { pathWithinGrant: true, pathWithinOutputRoot: false },
      decision: "allow",
    },
    {
      id: "allow-create",
      action: "file.create",
      when: { pathWithinGrant: true, pathWithinOutputRoot: false },
      decision: "allow",
    },
    {
      id: "confirm-delete",
      action: "file.delete",
      decision: "allow_with_confirm",
      riskTags: ["delete"],
      reason: "delete requires confirmation",
    },
    {
      id: "allow-rename",
      action: "file.rename",
      decision: "allow",
    },
    {
      id: "allow-move",
      action: "file.move",
      decision: "allow",
    },
    {
      id: "deny-network-default",
      action: "network.request",
      decision: "deny",
      reason: "network disabled by default",
    },
    {
      id: "allow-network-allowlist",
      action: "network.request",
      when: { hostInAllowlist: true },
      decision: "allow",
    },
    {
      id: "allow-connector-read",
      action: "connector.read",
      when: { connectorScopeAllowed: true },
      decision: "allow",
    },
    {
      id: "allow-connector-action",
      action: "connector.action",
      when: { connectorScopeAllowed: true },
      decision: "allow",
    },
  ],
};
