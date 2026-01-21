export type NativeBindingLoaderOptions<T extends Record<string, unknown>> = {
  /** Absolute path to the package root containing native artifacts. */
  packageRoot: string;
  /** Binding base names to search for (without extension). */
  bindingNames: string[];
  /** Optional environment variable to override the binding path. */
  envVar?: string;
  /** Keys expected to exist on the loaded binding. */
  requiredExports?: Array<keyof T>;
  /** Tag used in error messages. */
  logTag?: string;
};

export type NativeBindingLoadResult<T> = {
  binding: T | null;
  error: Error | null;
  checkedPaths: string[];
};
