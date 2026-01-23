import { useMemo } from "react";
import { useVectorStore } from "./useVectorStore";

export function useSemanticSearch() {
  const { isAvailable, search } = useVectorStore();
  return useMemo(() => ({ isAvailable, search }), [isAvailable, search]);
}
