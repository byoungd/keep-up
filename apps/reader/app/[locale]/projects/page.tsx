"use client";

import { AIPanel } from "@/components/layout/AIPanel";
import { ReaderShellLayout } from "@/components/layout/ReaderShellLayout";
import { ProjectsClient } from "@/components/projects/ProjectsClient";
import { useAIPanelState } from "@/context/PanelStateContext";

export default function ProjectsPage() {
  const { setVisible: setShowAI } = useAIPanelState();

  return (
    <ReaderShellLayout rightPanel={<AIPanel onClose={() => setShowAI(false)} />}>
      <ProjectsClient />
    </ReaderShellLayout>
  );
}
