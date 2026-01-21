import type { NativeBindingLoaderOptions, NativeBindingLoadResult } from "./types";

export function buildNativeBindingCandidates(
  _packageRoot: string,
  _bindingNames: string[]
): string[] {
  return [];
}

export function loadNativeBinding<T extends Record<string, unknown>>(
  _options: NativeBindingLoaderOptions<T>
): NativeBindingLoadResult<T> {
  return {
    binding: null,
    error: new Error("Native bindings are not available in browser environments."),
    checkedPaths: [],
  };
}

export type { NativeBindingLoaderOptions, NativeBindingLoadResult } from "./types";
