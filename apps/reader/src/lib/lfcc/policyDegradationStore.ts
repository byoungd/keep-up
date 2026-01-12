import { createStore } from "@/lib/store";

type PolicyDegradationState = {
  degraded: boolean;
  reasons: Array<{ field: string; reason: string }>;
  setDegradation: (degraded: boolean, reasons: Array<{ field: string; reason: string }>) => void;
  clear: () => void;
};

export const usePolicyDegradationStore = createStore<PolicyDegradationState>(
  "policy-degradation-store",
  (set) => ({
    degraded: false,
    reasons: [],
    setDegradation: (degraded, reasons) => set({ degraded, reasons }),
    clear: () => set({ degraded: false, reasons: [] }),
  })
);
