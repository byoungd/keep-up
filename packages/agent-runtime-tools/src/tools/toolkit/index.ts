import { createRequire } from "node:module";

import { AgentToolkitToolServer, type AgentToolkitToolServerOptions } from "./toolkitServer";

type NativeAgentToolkit = {
  AgentToolkitRegistry: new () => unknown;
};

type NativeToolkitModule = {
  getNativeAgentToolkit: () => NativeAgentToolkit | null;
};

const require = createRequire(import.meta.url);

function loadNativeAgentToolkit(): NativeToolkitModule | null {
  try {
    return require("@ku0/agent-toolkit-rs/node") as NativeToolkitModule;
  } catch {
    return null;
  }
}

export function createAgentToolkitToolServer(
  options: AgentToolkitToolServerOptions = {}
): AgentToolkitToolServer | null {
  const nativeModule = loadNativeAgentToolkit();
  const native = nativeModule?.getNativeAgentToolkit?.();
  if (!native) {
    return null;
  }
  return new AgentToolkitToolServer(new native.AgentToolkitRegistry(), options);
}

export type { AgentToolkitToolServerOptions, ArtifactEmitter } from "./toolkitServer";
export { AgentToolkitToolServer } from "./toolkitServer";
