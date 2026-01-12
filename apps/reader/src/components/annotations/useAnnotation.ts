import { useMachine } from "@xstate/react";
import { annotationMachine } from "./machine";

export function useAnnotation(_initialState: "active" | "active_unverified" = "active_unverified") {
  const [snapshot, send] = useMachine(annotationMachine);
  /*
        // XState v5 context override via hook options is deprecated/changed.
        // Assuming machine default context is sufficient or input should be used if machine expects it.
        // For now, removing to fix build.
        // context: {
        //    id: Math.random().toString(36).substring(7),
        //    retries: 0
        // }
    */

  // Force set initial state for demo purposes if needed,
  // though XState typically starts at 'initial' defined in machine.
  // In a real app, we'd hydrate from prop.

  // Expose simplified state for UI
  const state = snapshot.value as
    | "active"
    | "active_unverified"
    | "broken_grace"
    | "orphan"
    | "hidden"
    | "deleted";

  return {
    state,
    send,
    context: snapshot.context,
  };
}
