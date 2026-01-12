import { useEffect, useRef, useState } from "react";

import type { FailClosedPayload } from "@/components/lfcc/DevFailClosedBanner";

export type FailClosedBannerState = {
  failClosed: FailClosedPayload | null;
  showFailClosed: (info: FailClosedPayload) => void;
  clearFailClosed: () => void;
};

export function useFailClosedBanner(enabled: boolean, timeoutMs = 6000): FailClosedBannerState {
  const [failClosed, setFailClosed] = useState<FailClosedPayload | null>(null);
  const clearTimer = useRef<number | null>(null);

  const clearFailClosed = () => {
    if (clearTimer.current) {
      window.clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
    setFailClosed(null);
  };

  const showFailClosed = (info: FailClosedPayload) => {
    if (!enabled) {
      return;
    }
    clearFailClosed();
    setFailClosed(info);
    clearTimer.current = window.setTimeout(() => clearFailClosed(), timeoutMs);
  };

  useEffect(() => {
    return () => {
      if (clearTimer.current) {
        window.clearTimeout(clearTimer.current);
      }
    };
  }, []);

  return { failClosed, showFailClosed, clearFailClosed };
}
