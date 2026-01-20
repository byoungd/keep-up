import type { ToolPolicyContext, ToolPolicyDecision, ToolPolicyEngine } from "../security";
import type { MCPTool } from "../types";
import type { AgentModeManager } from "./AgentModeManager";

export class ModeToolPolicyEngine implements ToolPolicyEngine {
  constructor(
    private readonly modeManager: AgentModeManager,
    private readonly basePolicy: ToolPolicyEngine
  ) {}

  evaluate(context: ToolPolicyContext): ToolPolicyDecision {
    const baseDecision = this.basePolicy.evaluate(context);
    if (!baseDecision.allowed) {
      return baseDecision;
    }

    if (
      this.modeManager.isReadOnlyMode() &&
      !isReadOnlyModeToolAllowed(
        context.call.name,
        context.toolDefinition,
        this.modeManager.isPlanMode()
      )
    ) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: this.modeManager.getDenialMessage(context.call.name),
        riskTags: baseDecision.riskTags,
        policyDecision: baseDecision.policyDecision,
        policyRuleId: baseDecision.policyRuleId,
        policyAction: baseDecision.policyAction,
        reasonCode: baseDecision.reasonCode,
        escalation: baseDecision.escalation,
      };
    }

    return baseDecision;
  }
}

export function createModePolicyEngine(
  modeManager: AgentModeManager,
  basePolicy: ToolPolicyEngine
): ToolPolicyEngine {
  return new ModeToolPolicyEngine(modeManager, basePolicy);
}

function isReadOnlyModeToolAllowed(
  toolName: string,
  toolDefinition: MCPTool | undefined,
  allowPlanTools: boolean
): boolean {
  if (allowPlanTools && toolName.startsWith("plan:")) {
    return true;
  }
  return toolDefinition?.annotations?.readOnly === true;
}
