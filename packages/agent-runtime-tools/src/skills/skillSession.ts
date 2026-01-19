import type { AuditLogger, SkillActivation, ToolContext } from "@ku0/agent-runtime-core";
import type { SkillRegistry } from "./skillRegistry";

export class SkillSession {
  private readonly registry: SkillRegistry;
  private readonly audit?: AuditLogger;
  private activeSkills = new Map<string, SkillActivation>();

  constructor(registry: SkillRegistry, audit?: AuditLogger) {
    this.registry = registry;
    this.audit = audit;
  }

  activate(skillId: string, context: ToolContext): SkillActivation | null {
    if (this.registry.isDisabled(skillId)) {
      return null;
    }

    const entry = this.registry.get(skillId);
    if (!entry) {
      return null;
    }

    const activation: SkillActivation = {
      skillId: entry.skillId,
      hash: entry.hash,
      source: entry.source,
      sessionId: context.sessionId ?? "unknown",
      taskId: context.taskNodeId,
      activatedAt: new Date().toISOString(),
    };

    this.activeSkills.set(entry.skillId, activation);

    this.audit?.log({
      timestamp: Date.now(),
      toolName: "skill.activated",
      action: "result",
      userId: context.userId,
      correlationId: context.correlationId,
      input: { skillId: entry.skillId, source: entry.source },
      output: { hash: entry.hash },
      sandboxed: context.security.sandbox.type !== "none",
    });

    return activation;
  }

  getActiveSkills(): SkillActivation[] {
    return Array.from(this.activeSkills.values());
  }

  isActive(skillId: string): boolean {
    return this.activeSkills.has(skillId);
  }

  clear(): void {
    this.activeSkills.clear();
  }
}

export function createSkillSession(registry: SkillRegistry, audit?: AuditLogger): SkillSession {
  return new SkillSession(registry, audit);
}
