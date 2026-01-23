import path from "node:path";
import { fileURLToPath } from "node:url";

import { nativeFlagStore } from "@ku0/native-bindings/flags";
import { loadNativeBinding } from "@ku0/native-bindings/node";
import type { NativeToolGatewayBinding } from "./types";

export type {
  CapabilityGrant,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  McpManifest,
  McpServerConfig,
  McpTransportConfig,
  NativeToolGatewayBinding,
  ToolAuditEvent,
  ToolGateway,
  ToolGatewaySnapshot,
  ToolInvocation,
  ToolRegistryEntry,
} from "./types";

let cachedBinding: NativeToolGatewayBinding | null | undefined;
let cachedError: Error | null = null;

function isNativeEnabled(): boolean {
  if (process.env.KU0_TOOL_GATEWAY_DISABLE_NATIVE === "1") {
    return false;
  }
  return nativeFlagStore.getFlag("native_accelerators_enabled");
}

function resolvePackageRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..");
}

export function getNativeToolGateway(): NativeToolGatewayBinding | null {
  if (!isNativeEnabled()) {
    return null;
  }

  if (cachedBinding !== undefined) {
    return cachedBinding;
  }

  const result = loadNativeBinding<NativeToolGatewayBinding>({
    packageRoot: resolvePackageRoot(),
    bindingNames: ["tool_gateway_rs", "index"],
    envVar: "KU0_TOOL_GATEWAY_NATIVE_PATH",
    requiredExports: ["ToolGateway"],
    logTag: "Tool gateway native binding",
  });

  cachedError = result.error;
  cachedBinding = result.binding;
  return cachedBinding ?? null;
}

export function getNativeToolGatewayError(): Error | null {
  return cachedError;
}
