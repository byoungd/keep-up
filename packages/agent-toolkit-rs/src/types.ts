export type ToolkitToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; uri: string; mimeType?: string };

export type ToolkitToolError = {
  code: string;
  message: string;
  details?: string;
};

export type AgentToolkitArtifact = {
  path: string;
  size: number;
  checksum: string;
  mimeType?: string;
  title?: string;
};

export type ToolkitToolResult = {
  success: boolean;
  content: ToolkitToolContent[];
  error?: ToolkitToolError;
  artifacts?: AgentToolkitArtifact[];
};

export type ToolkitToolDefinition = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
};

export type AgentToolkitRegistryBinding = {
  registerAllTools: () => void;
  invoke: (toolName: string, payload: Record<string, unknown>) => ToolkitToolResult;
  getToolList: () => ToolkitToolDefinition[];
  reset: () => void;
};

export type NativeAgentToolkitBinding = {
  AgentToolkitRegistry: new () => AgentToolkitRegistryBinding;
};
