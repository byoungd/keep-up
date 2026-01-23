import { getNativeAgentToolkit } from "@ku0/agent-toolkit-rs/node";

import { AgentToolkitToolServer, type AgentToolkitToolServerOptions } from "./toolkitServer";

export function createAgentToolkitToolServer(
  options: AgentToolkitToolServerOptions = {}
): AgentToolkitToolServer | null {
  const native = getNativeAgentToolkit();
  if (!native) {
    return null;
  }
  return new AgentToolkitToolServer(new native.AgentToolkitRegistry(), options);
}

export type { AgentToolkitToolServerOptions, ArtifactEmitter } from "./toolkitServer";
export { AgentToolkitToolServer } from "./toolkitServer";
