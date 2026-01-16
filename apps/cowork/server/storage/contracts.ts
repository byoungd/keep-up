import type { CoworkProject, CoworkSession, CoworkTask } from "@ku0/agent-runtime";
import type {
  AgentStateCheckpointRecord,
  CoworkApproval,
  CoworkArtifactRecord,
  CoworkSettings,
} from "./types";

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

export interface AgentStateCheckpointStoreLike {
  getAll(): Promise<AgentStateCheckpointRecord[]>;
  getById(checkpointId: string): Promise<AgentStateCheckpointRecord | null>;
  getBySession(sessionId: string): Promise<AgentStateCheckpointRecord[]>;
  create(record: AgentStateCheckpointRecord): Promise<AgentStateCheckpointRecord>;
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

export interface ArtifactStoreLike {
  getAll(): Promise<CoworkArtifactRecord[]>;
  getById(artifactId: string): Promise<CoworkArtifactRecord | null>;
  getBySession(sessionId: string): Promise<CoworkArtifactRecord[]>;
  getByTask(taskId: string): Promise<CoworkArtifactRecord[]>;
  upsert(artifact: CoworkArtifactRecord): Promise<CoworkArtifactRecord>;
  delete(artifactId: string): Promise<boolean>;
}

export interface StorageLayer {
  sessionStore: SessionStoreLike;
  taskStore: TaskStoreLike;
  artifactStore: ArtifactStoreLike;
  approvalStore: ApprovalStoreLike;
  agentStateStore: AgentStateCheckpointStoreLike;
  configStore: ConfigStoreLike;
  projectStore: ProjectStoreLike;
}
