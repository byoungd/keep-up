export interface ApprovalPolicy {
  /** Policy name */
  name: string;
  /** Tools this policy applies to */
  tools: string[];
  /** Approval action */
  action: "approve" | "deny" | "ask";
  /** Conditions for this policy */
  conditions?: ApprovalCondition[];
  /** Priority (higher = checked first) */
  priority: number;
}

export interface ApprovalCondition {
  type: "path" | "content" | "size" | "risk";
  operator: "equals" | "contains" | "matches" | "lessThan" | "greaterThan";
  value: string | number | RegExp;
}

export interface ApprovalDecision {
  approved: boolean;
  reason?: string;
  policyName?: string;
  requiresUserConfirmation: boolean;
}

export interface WorkspaceContext {
  workspacePaths: string[];
}
