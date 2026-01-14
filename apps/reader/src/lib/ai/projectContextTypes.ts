export type ProjectContextSectionLabel =
  | "Project Tasks"
  | "Project Plan"
  | "Project Memory"
  | "Project Docs";

export type ProjectContextSection = {
  label: ProjectContextSectionLabel;
  text: string;
  sourcePath: string;
  originalLength: number;
  truncated: boolean;
  blockId: string;
};

export type ProjectTaskSummary = {
  id: string;
  title: string;
  checklistDone: number;
  checklistTotal: number;
  isComplete: boolean;
  openItems: string[];
};

export type ProjectContextSnapshot = {
  sections: ProjectContextSection[];
  tasks: ProjectTaskSummary[];
  updatedAt: string;
  warnings: string[];
};
