import { A11yReporter } from "@/components/dev/A11yReporter";
import { WebVitalsReporter } from "@/components/dev/WebVitalsReporter";
import { ImportWrapper } from "@/components/import/ImportWrapper";

import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { AuthProvider } from "@/context/AuthContext";
import { KeyboardShortcutsProvider } from "@/context/KeyboardShortcutsContext";
// Reusing fonts and styles from root layout
import { PanelStateProvider } from "@/context/PanelStateContext";
import { ProviderConfigProvider } from "@/context/ProviderConfigContext";
import { ReaderPreferencesProvider } from "@/context/ReaderPreferencesContext";
import { RssStoreProvider } from "@/lib/rss";
import { ReactQueryProvider } from "@/providers/ReactQueryProvider";
import { LazyMotion, domAnimation } from "framer-motion";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

export const metadata = {
  title: "ku0.com Reader",
  description: "AI-native collaborative reading and annotation",
};

import { cookies } from "next/headers";

// ...

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await params;
  const messages = await getMessages();

  // Read panel state from cookies for SSR
  const cookieStore = await cookies();
  const panelStateCookie = cookieStore.get("ui-panel-state-v2");
  let panelState: Record<string, unknown> | undefined;
  try {
    panelState = panelStateCookie
      ? (JSON.parse(panelStateCookie.value) as Record<string, unknown>)
      : undefined;
  } catch {
    // ignore parse error
  }

  return (
    <NextIntlClientProvider messages={messages}>
      <PanelStateProvider initialState={panelState}>
        <AuthProvider>
          <ReaderPreferencesProvider>
            <TooltipProvider>
              <ToastProvider>
                <KeyboardShortcutsProvider>
                  <LazyMotion features={domAnimation}>
                    <ErrorBoundary>
                      <ProviderConfigProvider>
                        <ReactQueryProvider>
                          <RssStoreProvider>
                            <ImportWrapper>{children}</ImportWrapper>
                          </RssStoreProvider>
                        </ReactQueryProvider>
                      </ProviderConfigProvider>
                    </ErrorBoundary>
                    <A11yReporter />
                    <WebVitalsReporter />
                  </LazyMotion>
                </KeyboardShortcutsProvider>
              </ToastProvider>
            </TooltipProvider>
          </ReaderPreferencesProvider>
        </AuthProvider>
      </PanelStateProvider>
    </NextIntlClientProvider>
  );
}
