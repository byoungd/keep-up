/**
 * Cowork Permission Checker
 *
 * Evaluates file actions against Cowork grants and policy rules,
 * while deferring non-file checks to the base permission checker.
 */

import type { IPermissionChecker, PermissionCheck, PermissionResult } from "../security";
import type { CoworkPolicyEngine } from "./policy";
import { type CoworkFileIntent, CoworkSandboxAdapter } from "./sandbox";
import type { CoworkSession } from "./types";

export interface CoworkPermissionCheckerConfig {
  session: CoworkSession;
  policyEngine: CoworkPolicyEngine;
  baseChecker: IPermissionChecker;
  caseInsensitivePaths?: boolean;
}

export class CoworkPermissionChecker implements IPermissionChecker {
  private readonly session: CoworkSession;
  private readonly baseChecker: IPermissionChecker;
  private readonly sandbox: CoworkSandboxAdapter;
  private readonly caseInsensitivePaths: boolean;

  constructor(config: CoworkPermissionCheckerConfig) {
    this.session = config.session;
    this.baseChecker = config.baseChecker;
    this.sandbox = new CoworkSandboxAdapter(config.policyEngine);
    this.caseInsensitivePaths = config.caseInsensitivePaths ?? false;
  }

  check(check: PermissionCheck): PermissionResult {
    if (check.tool !== "file") {
      return this.baseChecker.check(check);
    }

    if (typeof check.resource !== "string") {
      return {
        allowed: false,
        reason: "Missing file path for Cowork policy evaluation",
      };
    }

    const intent = resolveFileIntent(check.operation);
    if (!intent) {
      return this.baseChecker.check(check);
    }

    const decision = this.sandbox.evaluateFileAction({
      session: this.session,
      path: check.resource,
      intent,
      caseInsensitivePaths: this.caseInsensitivePaths,
    });

    if (decision.decision === "deny") {
      return {
        allowed: false,
        reason: decision.reason,
      };
    }

    return {
      allowed: true,
      requiresConfirmation: decision.requiresConfirmation,
      reason: decision.reason,
      riskTags: decision.riskTags,
    };
  }

  getPolicy() {
    return this.baseChecker.getPolicy();
  }
}

function resolveFileIntent(operation: string): CoworkFileIntent | null {
  switch (operation) {
    case "read":
    case "list":
    case "info":
      return "read";
    case "write":
      return "write";
    case "create":
      return "create";
    case "delete":
      return "delete";
    case "rename":
      return "rename";
    case "move":
      return "move";
    default:
      return null;
  }
}
