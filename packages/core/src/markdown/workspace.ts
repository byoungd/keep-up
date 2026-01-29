import type { MarkdownPreconditionV1 } from "./types.js";

export type WorkspacePrecondition = {
  v: 1;
  mode: "workspace";
  files: Array<{ path: string; precondition: MarkdownPreconditionV1 }>;
};

export type MdWorkspaceRefactor = {
  op: "md_workspace_refactor";
  preconditions: WorkspacePrecondition;
  refactor_type: "rename" | "move" | "extract" | "inline";
  scope: {
    from: { path: string; symbol: string };
    to: { path?: string; symbol?: string };
  };
};
