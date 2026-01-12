import { assign, setup } from "xstate";

export type AnnotationContext = {
  id: string;
  errorMessage?: string;
  retries: number;
};

export type AnnotationEvent =
  | { type: "VERIFY_SUCCESS" }
  | { type: "VERIFY_FAILURE"; error: string }
  | { type: "RECOVER_SUCCESS" }
  | { type: "RECOVER_FAILURE" }
  | { type: "DELETE" }
  | { type: "RESTORE" }
  | { type: "HIDE" }
  | { type: "SHOW" }
  | { type: "ORPHAN" };

export const annotationMachine = setup({
  types: {
    context: {} as AnnotationContext,
    events: {} as AnnotationEvent,
  },
  actions: {
    setError: assign({
      errorMessage: ({ event }: { event: AnnotationEvent }) =>
        event.type === "VERIFY_FAILURE" ? event.error : undefined,
    }),
    incrementRetries: assign({
      retries: ({ context }: { context: AnnotationContext }) => context.retries + 1,
    }),
    clearError: assign({
      errorMessage: undefined,
      retries: 0,
    }),
  },
}).createMachine({
  id: "annotation",
  initial: "active_unverified",
  context: {
    id: "",
    retries: 0,
    errorMessage: undefined,
  },
  states: {
    active_unverified: {
      tags: ["ui-only"],
      description: "Optimistic state immediately after creation or edit. Displays as 'Scanning...'",
      on: {
        VERIFY_SUCCESS: {
          target: "active",
          actions: "clearError",
        },
        VERIFY_FAILURE: {
          target: "broken_grace",
          actions: "setError",
        },
      },
    },
    active: {
      tags: ["persisted"],
      description: "Steady state. Valid and verified on the blockchain/storage.",
      on: {
        HIDE: "hidden",
        DELETE: "deleted",
        ORPHAN: "orphan",
      },
    },
    broken_grace: {
      tags: ["ui-only", "timer"],
      description:
        "Verification failed (e.g., hash mismatch), but giving user time to fix or system to recover.",
      on: {
        RECOVER_SUCCESS: {
          target: "active",
          actions: "clearError",
        },
        RECOVER_FAILURE: "orphan", // If recovery fails after retries
        DELETE: "deleted",
      },
    },
    orphan: {
      tags: ["persisted"],
      description: "Anchor lost completely. Displayed in sidebar or grayed out.",
      on: {
        RESTORE: "active_unverified", // Try to re-attach
        DELETE: "deleted",
      },
    },
    hidden: {
      tags: ["persisted"],
      on: {
        SHOW: "active",
      },
    },
    deleted: {
      type: "final",
    },
  },
});
