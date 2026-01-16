import type { CoworkProject, CoworkSession, CoworkTask } from "@ku0/agent-runtime";
import type { CoworkApproval, CoworkSettings } from "./types";

export interface SessionStoreLike {
  getAll(): Promise<CoworkSession[]>;
  getById(sessionId: string): Promise<CoworkSession | null>;
  create(session: CoworkSession): Promise<CoworkSession>;
  update(
    sessionId: string,
    updater: (session: CoworkSession) => CoworkSession
  ): Promise<CoworkSession | null>;
  delete(sessionId: string): Promise<boolean>;
}

export interface TaskStoreLike {
  getAll(): Promise<CoworkTask[]>;
  getById(taskId: string): Promise<CoworkTask | null>;
  getBySession(sessionId: string): Promise<CoworkTask[]>;
  create(task: CoworkTask): Promise<CoworkTask>;
  update(taskId: string, updater: (task: CoworkTask) => CoworkTask): Promise<CoworkTask | null>;
}

export interface ApprovalStoreLike {
  getAll(): Promise<CoworkApproval[]>;
  getById(approvalId: string): Promise<CoworkApproval | null>;
  getBySession(sessionId: string): Promise<CoworkApproval[]>;
  create(approval: CoworkApproval): Promise<CoworkApproval>;
  update(
    approvalId: string,
    updater: (approval: CoworkApproval) => CoworkApproval
  ): Promise<CoworkApproval | null>;
}

export interface ConfigStoreLike {
  get(): Promise<CoworkSettings>;
  set(next: CoworkSettings): Promise<CoworkSettings>;
  update(updater: (current: CoworkSettings) => CoworkSettings): Promise<CoworkSettings>;
}

export interface ProjectStoreLike {
  getAll(): Promise<CoworkProject[]>;
  getById(projectId: string): Promise<CoworkProject | null>;
  create(project: CoworkProject): Promise<CoworkProject>;
  update(
    projectId: string,
    updater: (project: CoworkProject) => CoworkProject
  ): Promise<CoworkProject | null>;
  delete(projectId: string): Promise<boolean>;
}

export interface StorageLayer {
  sessionStore: SessionStoreLike;
  taskStore: TaskStoreLike;
  approvalStore: ApprovalStoreLike;
  configStore: ConfigStoreLike;
  projectStore: ProjectStoreLike;
}
