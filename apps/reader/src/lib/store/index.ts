import { type StateCreator, create } from "zustand";
import { devtools, persist, subscribeWithSelector } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

// ============================================================================
// Types
// ============================================================================

interface CreateStoreOptions {
  /** Enable localStorage persistence */
  persist?: boolean;
  /** Custom storage key (defaults to store name) */
  storageKey?: string;
  /** Partial state to persist (by default persists everything) */
  partialize?: <T>(state: T) => Partial<T>;
}

// ============================================================================
// Store Factory
// ============================================================================

/**
 * Creates a Zustand store with standard middleware stack:
 * - subscribeWithSelector: enables fine-grained subscriptions
 * - persist (optional): localStorage persistence
 * - devtools: Redux DevTools integration in development
 *
 * @example
 * ```ts
 * const useCounterStore = createStore<CounterState>("counter", (set) => ({
 *   count: 0,
 *   increment: () => set((state) => ({ count: state.count + 1 })),
 * }));
 * ```
 */
export function createStore<T>(
  name: string,
  initializer: StateCreator<T>,
  options?: CreateStoreOptions
) {
  // Base middleware chain: subscribeWithSelector -> initializer
  // Use generic StateCreator to handle the middleware augmentation
  let storeInitializer: StateCreator<T, [], [["zustand/subscribeWithSelector", never]]> =
    subscribeWithSelector(initializer);

  // Add persist middleware if requested
  if (options?.persist) {
    // biome-ignore lint/suspicious/noExplicitAny: complex middleware chain type mapping requires any cast
    storeInitializer = persist(storeInitializer as any, {
      name: options.storageKey ?? name,
      partialize: options.partialize as never,
    }) as StateCreator<T, [], [["zustand/subscribeWithSelector", never]]>;
  }

  // Add devtools middleware (always included for better debugging in dev)
  // biome-ignore lint/suspicious/noExplicitAny: complex middleware chain type mapping
  const finalInitializer = devtools(storeInitializer as any, {
    name,
    enabled: process.env.NODE_ENV === "development",
  });

  // biome-ignore lint/suspicious/noExplicitAny: zustand create requires flexible typing for middleware chain
  return create<T>()(finalInitializer as any);
}

// ============================================================================
// Selector Utilities
// ============================================================================

/**
 * Creates a typed selector hook for a specific store.
 * Useful for creating reusable selectors with proper typing.
 *
 * @example
 * ```ts
 * const selectCount = createSelector(useCounterStore, (state) => state.count);
 * // Usage: const count = selectCount();
 * ```
 */
export function createSelector<State, Selected>(
  useStore: (selector: (state: State) => Selected) => Selected,
  selector: (state: State) => Selected
): () => Selected {
  return () => useStore(selector);
}

/**
 * Creates a shallow-compared selector for objects/arrays.
 * Prevents unnecessary re-renders when selecting multiple values.
 *
 * @example
 * ```ts
 * const { count, name } = useCounterStore(
 *   shallowSelect((state) => ({ count: state.count, name: state.name }))
 * );
 * ```
 */
export function shallowSelect<T, R>(selector: (state: T) => R): (state: T) => R {
  return useShallow(selector);
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export { useShallow } from "zustand/react/shallow";
