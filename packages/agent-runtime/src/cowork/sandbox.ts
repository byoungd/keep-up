/**
 * Cowork Sandbox Adapter
 *
 * Policy evaluation helpers for Cowork file/network/connector actions.
 */

import * as path from "node:path";
import type { CoworkPolicyAction, CoworkPolicyDecision, CoworkPolicyEngine } from "./policy";
import { isPathWithinRoots } from "./policy";
import type { CoworkSession } from "./types";

export type CoworkFileIntent = "read" | "write" | "create" | "delete" | "rename" | "move";

export interface CoworkFileActionRequest {
  session: CoworkSession;
  path: string;
  intent: CoworkFileIntent;
  fileSizeBytes?: number;
  caseInsensitivePaths?: boolean;
}

export interface CoworkNetworkActionRequest {
  session: CoworkSession;
  host: string;
  hostAllowlist?: string[];
}

export interface CoworkConnectorActionRequest {
  session: CoworkSession;
  connectorScopeAllowed: boolean;
}

export interface CoworkSandboxDecision extends CoworkPolicyDecision {
  normalizedPath?: string;
  withinGrant?: boolean;
  withinOutputRoot?: boolean;
}

export class CoworkSandboxAdapter {
  private readonly policyEngine: CoworkPolicyEngine;

  constructor(policyEngine: CoworkPolicyEngine) {
    this.policyEngine = policyEngine;
  }

  evaluateFileAction(request: CoworkFileActionRequest): CoworkSandboxDecision {
    const caseInsensitivePaths = request.caseInsensitivePaths ?? false;
    const grantRoots = collectGrantRoots(request.session);
    const outputRoots = collectOutputRoots(request.session);
    const normalizedPath = normalizePath(request.path, caseInsensitivePaths);
    const withinGrant = isPathWithinRoots(request.path, grantRoots, caseInsensitivePaths);
    const withinOutputRoot = isPathWithinRoots(request.path, outputRoots, caseInsensitivePaths);

    const decision = this.policyEngine.evaluate({
      action: toFileAction(request.intent),
      path: request.path,
      grantRoots,
      outputRoots,
      fileSizeBytes: request.fileSizeBytes,
      caseInsensitivePaths,
    });

    return {
      ...decision,
      normalizedPath,
      withinGrant,
      withinOutputRoot,
    };
  }

  evaluateNetworkAction(request: CoworkNetworkActionRequest): CoworkSandboxDecision {
    const decision = this.policyEngine.evaluate({
      action: "network.request",
      host: request.host,
      hostAllowlist: request.hostAllowlist,
    });

    return { ...decision };
  }

  evaluateConnectorAction(request: CoworkConnectorActionRequest): CoworkSandboxDecision {
    const decision = this.policyEngine.evaluate({
      action: "connector.action",
      connectorScopeAllowed: request.connectorScopeAllowed,
    });

    return { ...decision };
  }
}

function toFileAction(intent: CoworkFileIntent): CoworkPolicyAction {
  return `file.${intent}` as CoworkPolicyAction;
}

function collectGrantRoots(session: CoworkSession): string[] {
  return session.grants.map((grant) => grant.rootPath);
}

function collectOutputRoots(session: CoworkSession): string[] {
  const roots: string[] = [];
  for (const grant of session.grants) {
    if (grant.outputRoots) {
      roots.push(...grant.outputRoots);
    }
  }
  return roots;
}

function normalizePath(input: string, caseInsensitive: boolean): string {
  const normalized = path.resolve(input).replace(/\\/g, "/");
  return caseInsensitive ? normalized.toLowerCase() : normalized;
}
