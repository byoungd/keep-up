/**
 * SQLite-based project store.
 */

import type { CoworkProject } from "@ku0/agent-runtime";
import type { ProjectStoreLike } from "./contracts";
import { getDatabase } from "./database";

export interface SqliteProjectStore extends ProjectStoreLike {
  getAll(): Promise<CoworkProject[]>;
  getById(projectId: string): Promise<CoworkProject | null>;
  create(project: CoworkProject): Promise<CoworkProject>;
  update(
    projectId: string,
    updater: (project: CoworkProject) => CoworkProject
  ): Promise<CoworkProject | null>;
  delete(projectId: string): Promise<boolean>;
}

export async function createSqliteProjectStore(): Promise<SqliteProjectStore> {
  const db = await getDatabase();

  const insertStmt = db.prepare(`
    INSERT INTO projects (project_id, name, description, path_hint, created_at, updated_at, metadata)
    VALUES ($projectId, $name, $description, $pathHint, $createdAt, $updatedAt, $metadata)
  `);

  const selectAllStmt = db.prepare(`
    SELECT * FROM projects ORDER BY updated_at DESC
  `);

  const selectByIdStmt = db.prepare(`
    SELECT * FROM projects WHERE project_id = $projectId
  `);

  const updateStmt = db.prepare(`
    UPDATE projects
    SET name = $name, description = $description, path_hint = $pathHint, updated_at = $updatedAt, metadata = $metadata
    WHERE project_id = $projectId
  `);

  const deleteStmt = db.prepare(`
    DELETE FROM projects WHERE project_id = $projectId
  `);

  function rowToProject(row: Record<string, unknown>): CoworkProject {
    return {
      projectId: row.project_id as string,
      name: row.name as string,
      description: (row.description as string) || undefined,
      pathHint: (row.path_hint as string) || undefined,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    };
  }

  function getById(projectId: string): CoworkProject | null {
    const row = selectByIdStmt.get({ $projectId: projectId }) as Record<string, unknown> | null;
    return row ? rowToProject(row) : null;
  }

  return {
    async getAll(): Promise<CoworkProject[]> {
      const rows = selectAllStmt.all() as Record<string, unknown>[];
      return rows.map(rowToProject);
    },

    async getById(projectId: string): Promise<CoworkProject | null> {
      return getById(projectId);
    },

    async create(project: CoworkProject): Promise<CoworkProject> {
      insertStmt.run({
        $projectId: project.projectId,
        $name: project.name,
        $description: project.description || null,
        $pathHint: project.pathHint || null,
        $createdAt: project.createdAt,
        $updatedAt: project.updatedAt,
        $metadata: JSON.stringify(project.metadata || {}),
      });
      return project;
    },

    async update(
      projectId: string,
      updater: (project: CoworkProject) => CoworkProject
    ): Promise<CoworkProject | null> {
      const existing = getById(projectId);
      if (!existing) {
        return null;
      }

      const updated = updater(existing);
      updateStmt.run({
        $projectId: updated.projectId,
        $name: updated.name,
        $description: updated.description || null,
        $pathHint: updated.pathHint || null,
        $updatedAt: Date.now(),
        $metadata: JSON.stringify(updated.metadata || {}),
      });
      return { ...updated, updatedAt: Date.now() };
    },

    async delete(projectId: string): Promise<boolean> {
      const result = deleteStmt.run({ $projectId: projectId });
      return result.changes > 0;
    },
  };
}
