"use client";

// In a real implementation, this overlay would be an absolute positioned layer
// matching the text layout coordinates.
// For this Phase 2 Frontend demo, we are using "Inline Spans" as the implementation strategy
// because we don't have the Core Block Mapping yet.
// So this component acts more as a Logical Container or Provider in the future.

export function AnnotationOverlay({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
