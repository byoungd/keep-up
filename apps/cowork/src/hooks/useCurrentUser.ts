import { useQuery } from "@tanstack/react-query";
import { getCurrentUser } from "../api/coworkApi";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["cowork", "current-user"],
    queryFn: getCurrentUser,
    staleTime: 5 * 60 * 1000,
  });
}
