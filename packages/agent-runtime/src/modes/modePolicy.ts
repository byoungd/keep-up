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
      this.modeManager.isPlanMode() &&
      !isPlanModeToolAllowed(context.call.name, context.toolDefinition)
    ) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: this.modeManager.getDenialMessage(context.call.name),
        riskTags: baseDecision.riskTags,
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

function isPlanModeToolAllowed(toolName: string, toolDefinition?: MCPTool): boolean {
  if (toolName.startsWith("plan:")) {
    return true;
  }
  return toolDefinition?.annotations?.readOnly === true;
}
