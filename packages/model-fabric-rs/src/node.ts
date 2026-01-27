import {
  loadNativeBinding,
  type NativeBindingLoadResult,
  resolvePackageRoot,
} from "@ku0/native-bindings/node";

import type {
  CompletionRequest,
  CompletionResponse,
  ModelFabricContext,
  ModelFabricSnapshot,
  ModelStreamHandle,
  ModelUsageEvent,
  ProviderConfigRecord,
  RouteRule,
} from "./types";

const DISABLE_NATIVE_ENV = "KU0_MODEL_FABRIC_DISABLE_NATIVE";
const NATIVE_PATH_ENV = "KU0_MODEL_FABRIC_NATIVE_PATH";

interface NativeModelFabric {
  loadProviders(records: ProviderConfigRecord[]): void;
  loadRoutes(routes: RouteRule[]): void;
  complete(request: CompletionRequest, context?: ModelFabricContext): Promise<CompletionResponse>;
  stream(request: CompletionRequest, context?: ModelFabricContext): ModelStreamHandle;
  getSnapshot(): ModelFabricSnapshot;
  drainUsageEvents(after?: number, limit?: number): ModelUsageEvent[];
  reset(): void;
}

interface NativeBinding extends Record<string, unknown> {
  ModelFabric: new () => NativeModelFabric;
}

const bindingState: NativeBindingLoadResult<NativeBinding> & {
  binding: NativeBinding | null;
  error: Error | null;
} = {
  binding: null,
  error: null,
  checkedPaths: [],
};

function readDisableFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isNativeDisabled(): boolean {
  return readDisableFlag(process.env[DISABLE_NATIVE_ENV]);
}

function loadBinding(): NativeBinding {
  if (bindingState.binding) {
    return bindingState.binding;
  }
  if (bindingState.error) {
    throw bindingState.error;
  }
  if (isNativeDisabled()) {
    const error = new Error("Native model fabric is disabled by environment flag.");
    bindingState.error = error;
    throw error;
  }

  const packageRoot = resolvePackageRoot(import.meta.url, 1);
  const result = loadNativeBinding<NativeBinding>({
    packageRoot,
    bindingNames: ["model_fabric_rs"],
    envVar: NATIVE_PATH_ENV,
    requiredExports: ["ModelFabric"],
    logTag: "ModelFabric",
  });

  bindingState.binding = result.binding;
  bindingState.error = result.error;
  bindingState.checkedPaths = result.checkedPaths;

  if (!result.binding) {
    throw result.error ?? new Error("ModelFabric native binding not found.");
  }

  return result.binding;
}

export function isModelFabricAvailable(): boolean {
  try {
    loadBinding();
    return true;
  } catch {
    return false;
  }
}

export class ModelFabric {
  private readonly fabric: NativeModelFabric;

  constructor() {
    const binding = loadBinding();
    this.fabric = new binding.ModelFabric();
  }

  loadProviders(records: ProviderConfigRecord[]): void {
    this.fabric.loadProviders(records);
  }

  loadRoutes(routes: RouteRule[]): void {
    this.fabric.loadRoutes(routes);
  }

  complete(request: CompletionRequest, context?: ModelFabricContext): Promise<CompletionResponse> {
    return this.fabric.complete(request, context);
  }

  stream(request: CompletionRequest, context?: ModelFabricContext): ModelStreamHandle {
    return this.fabric.stream(request, context);
  }

  getSnapshot(): ModelFabricSnapshot {
    return this.fabric.getSnapshot();
  }

  drainUsageEvents(after?: number, limit?: number): ModelUsageEvent[] {
    return this.fabric.drainUsageEvents(after, limit);
  }

  reset(): void {
    this.fabric.reset();
  }
}

export type { StreamChunk } from "./types";
