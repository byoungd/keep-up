"use client";

import { ModelLanesSettings, ProviderSettings } from "@/components/ai";
import { AppShell } from "@/components/layout/AppShell";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import * as React from "react";

export default function SettingsPage() {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  const effectiveDesktop = hydrated && isDesktop;

  return (
    <AppShell isDesktop={effectiveDesktop}>
      <main className="flex-1 overflow-y-auto min-w-0 bg-background p-6">
        <div className="max-w-2xl mx-auto space-y-10">
          <div>
            <h1 className="text-2xl font-bold mb-2">Settings</h1>
            <p className="text-muted-foreground">Manage your workspace preferences.</p>
          </div>

          <section>
            <ProviderSettings />
          </section>

          <section>
            <ModelLanesSettings />
          </section>
        </div>
      </main>
    </AppShell>
  );
}
