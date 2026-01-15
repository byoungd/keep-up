"use client";

import { DigestView } from "@/components/digest/DigestView";
import { AIPanel } from "@/components/layout/AIPanel";
import { ReaderShellLayout } from "@/components/layout/ReaderShellLayout";
import { useAIPanelState } from "@/context/PanelStateContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import * as React from "react";

export default function DigestPage() {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  const effectiveDesktop = hydrated && isDesktop;

  const { setVisible } = useAIPanelState();

  return (
    <ReaderShellLayout
      isDesktop={effectiveDesktop}
      rightPanel={<AIPanel onClose={() => setVisible(false)} />}
    >
      <main className="flex-1 overflow-y-auto min-w-0 bg-background">
        <DigestView />
      </main>
    </ReaderShellLayout>
  );
}
