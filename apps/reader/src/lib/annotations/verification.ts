import type { Annotation } from "@/lib/kernel/types";
import type { DisplayAnnoState } from "@keepup/core";

const VERIFIED_STATES: DisplayAnnoState[] = ["active", "active_partial"];

export function isVerifiedDisplayState(state: DisplayAnnoState): boolean {
  return VERIFIED_STATES.includes(state);
}

export function isUnverifiedDisplayState(state: DisplayAnnoState): boolean {
  return !isVerifiedDisplayState(state);
}

export function isVerified(annotation: Annotation): boolean {
  return isVerifiedDisplayState(annotation.displayState);
}

const displayStateLabels: Record<DisplayAnnoState, string> = {
  active: "Active",
  active_partial: "Partial match",
  active_unverified: "Needs verification",
  broken_grace: "Needs review",
  orphan: "Missing target",
};

export function formatDisplayState(state: DisplayAnnoState): string {
  return displayStateLabels[state] ?? state.replace(/_/g, " ");
}
