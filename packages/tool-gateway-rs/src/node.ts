import { nativeFlagStore } from "@ku0/native-bindings/flags";
import { loadNativeBinding, resolvePackageRoot } from "@ku0/native-bindings/node";
import type { NativeToolGatewayBinding } from "./types";

export type {
  CapabilityGrant,
  McpManifest,
  McpServerConfig,
  McpTransport,
  NativeToolGatewayBinding,
  ToolAuditEvent,
  ToolGatewayBinding,
  ToolGatewaySnapshot,
  ToolInvocation,
  ToolRegistryEntry,
} from "./types";

let cachedBinding: NativeToolGatewayBinding | null | undefined;
let cachedError: Error | null = null;

function readDisableFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isNativeEnabled(): boolean {
  if (readDisableFlag(process.env.KU0_TOOL_GATEWAY_DISABLE_NATIVE)) {
    return false;
  }
  return nativeFlagStore.getFlag("native_accelerators_enabled");
}

export function getNativeToolGateway(): NativeToolGatewayBinding | null {
  if (!isNativeEnabled()) {
    return null;
  }

  if (cachedBinding !== undefined) {
    return cachedBinding ?? null;
  }

  const result = loadNativeBinding<NativeToolGatewayBinding>({
    packageRoot: resolvePackageRoot(import.meta.url, 1),
    bindingNames: ["tool_gateway_rs", "index"],
    envVar: "KU0_TOOL_GATEWAY_NATIVE_PATH",
    requiredExports: ["ToolGateway"],
    logTag: "Tool gateway native binding",
  });

  cachedError = result.error;
  cachedBinding = result.binding ?? null;
  return cachedBinding ?? null;
}

export function getNativeToolGatewayError(): Error | null {
  return cachedError;
}
