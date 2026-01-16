export type Workspace = {
  id: string;
  name: string;
  pathHint?: string;
  createdAt: number;
  lastOpenedAt: number;
};

export type Session = {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: number;
  projectId?: string;
};

export type Project = {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  createdAt: number;
};

export type WorkspaceSelection = {
  name: string;
  pathHint?: string;
};
