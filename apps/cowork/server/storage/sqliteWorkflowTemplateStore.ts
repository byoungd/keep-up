import type { CoworkWorkflowTemplate } from "@ku0/agent-runtime";
import type { WorkflowTemplateStoreLike } from "./contracts";
import { getDatabase } from "./database";

export interface SqliteWorkflowTemplateStore extends WorkflowTemplateStoreLike {
  getAll(): Promise<CoworkWorkflowTemplate[]>;
  getById(templateId: string): Promise<CoworkWorkflowTemplate | null>;
  create(template: CoworkWorkflowTemplate): Promise<CoworkWorkflowTemplate>;
  update(
    templateId: string,
    updater: (template: CoworkWorkflowTemplate) => CoworkWorkflowTemplate
  ): Promise<CoworkWorkflowTemplate | null>;
  delete(templateId: string): Promise<boolean>;
}

export async function createSqliteWorkflowTemplateStore(): Promise<SqliteWorkflowTemplateStore> {
  const db = await getDatabase();

  const insertStmt = db.prepare(`
    INSERT INTO workflow_templates (
      template_id,
      name,
      description,
      mode,
      inputs,
      prompt,
      expected_artifacts,
      version,
      created_at,
      updated_at,
      usage_count,
      last_used_at,
      last_used_inputs,
      last_used_session_id
    ) VALUES (
      $templateId,
      $name,
      $description,
      $mode,
      $inputs,
      $prompt,
      $expectedArtifacts,
      $version,
      $createdAt,
      $updatedAt,
      $usageCount,
      $lastUsedAt,
      $lastUsedInputs,
      $lastUsedSessionId
    )
  `);

  const selectAllStmt = db.prepare(`
    SELECT * FROM workflow_templates ORDER BY updated_at DESC
  `);

  const selectByIdStmt = db.prepare(`
    SELECT * FROM workflow_templates WHERE template_id = $templateId
  `);

  const updateStmt = db.prepare(`
    UPDATE workflow_templates
    SET name = $name,
      description = $description,
      mode = $mode,
      inputs = $inputs,
      prompt = $prompt,
      expected_artifacts = $expectedArtifacts,
      version = $version,
      updated_at = $updatedAt,
      usage_count = $usageCount,
      last_used_at = $lastUsedAt,
      last_used_inputs = $lastUsedInputs,
      last_used_session_id = $lastUsedSessionId
    WHERE template_id = $templateId
  `);

  const deleteStmt = db.prepare(`
    DELETE FROM workflow_templates WHERE template_id = $templateId
  `);

  function rowToTemplate(row: Record<string, unknown>): CoworkWorkflowTemplate {
    return {
      templateId: row.template_id as string,
      name: row.name as string,
      description: (row.description as string) || "",
      mode: row.mode as CoworkWorkflowTemplate["mode"],
      inputs: row.inputs ? JSON.parse(row.inputs as string) : [],
      prompt: row.prompt as string,
      expectedArtifacts: row.expected_artifacts ? JSON.parse(row.expected_artifacts as string) : [],
      version: row.version as string,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      usageCount:
        row.usage_count !== null && row.usage_count !== undefined
          ? (row.usage_count as number)
          : undefined,
      lastUsedAt:
        row.last_used_at !== null && row.last_used_at !== undefined
          ? (row.last_used_at as number)
          : undefined,
      lastUsedInputs: row.last_used_inputs
        ? (JSON.parse(row.last_used_inputs as string) as Record<string, string>)
        : undefined,
      lastUsedSessionId: (row.last_used_session_id as string) || undefined,
    };
  }

  function getById(templateId: string): CoworkWorkflowTemplate | null {
    const row = selectByIdStmt.get({ $templateId: templateId }) as Record<string, unknown> | null;
    return row ? rowToTemplate(row) : null;
  }

  return {
    async getAll(): Promise<CoworkWorkflowTemplate[]> {
      const rows = selectAllStmt.all() as Record<string, unknown>[];
      return rows.map(rowToTemplate);
    },

    async getById(templateId: string): Promise<CoworkWorkflowTemplate | null> {
      return getById(templateId);
    },

    async create(template: CoworkWorkflowTemplate): Promise<CoworkWorkflowTemplate> {
      insertStmt.run({
        $templateId: template.templateId,
        $name: template.name,
        $description: template.description,
        $mode: template.mode,
        $inputs: JSON.stringify(template.inputs ?? []),
        $prompt: template.prompt,
        $expectedArtifacts: JSON.stringify(template.expectedArtifacts ?? []),
        $version: template.version,
        $createdAt: template.createdAt,
        $updatedAt: template.updatedAt,
        $usageCount: template.usageCount ?? 0,
        $lastUsedAt: template.lastUsedAt ?? null,
        $lastUsedInputs: template.lastUsedInputs ? JSON.stringify(template.lastUsedInputs) : null,
        $lastUsedSessionId: template.lastUsedSessionId ?? null,
      });
      return template;
    },

    async update(
      templateId: string,
      updater: (template: CoworkWorkflowTemplate) => CoworkWorkflowTemplate
    ): Promise<CoworkWorkflowTemplate | null> {
      const existing = getById(templateId);
      if (!existing) {
        return null;
      }

      const updated = updater(existing);
      updateStmt.run({
        $templateId: updated.templateId,
        $name: updated.name,
        $description: updated.description,
        $mode: updated.mode,
        $inputs: JSON.stringify(updated.inputs ?? []),
        $prompt: updated.prompt,
        $expectedArtifacts: JSON.stringify(updated.expectedArtifacts ?? []),
        $version: updated.version,
        $updatedAt: Date.now(),
        $usageCount: updated.usageCount ?? 0,
        $lastUsedAt: updated.lastUsedAt ?? null,
        $lastUsedInputs: updated.lastUsedInputs ? JSON.stringify(updated.lastUsedInputs) : null,
        $lastUsedSessionId: updated.lastUsedSessionId ?? null,
      });
      return { ...updated, updatedAt: Date.now() };
    },

    async delete(templateId: string): Promise<boolean> {
      const result = deleteStmt.run({ $templateId: templateId });
      return result.changes > 0;
    },
  };
}
