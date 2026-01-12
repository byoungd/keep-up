"use client";

import { AIPanel } from "@/components/layout/AIPanel";
import { AppShell } from "@/components/layout/AppShell";
import { ProjectsClient } from "@/components/projects/ProjectsClient";
import { useAIPanelState } from "@/context/PanelStateContext";

export default function ProjectsPage() {
  const { setVisible: setShowAI } = useAIPanelState();

  return (
    <AppShell rightPanel={<AIPanel onClose={() => setShowAI(false)} />}>
      <ProjectsClient />
    </AppShell>
  );
}
