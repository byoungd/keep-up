import {
  AppShell,
  ReaderPreferencesProvider,
  ReaderShellProvider,
  TooltipProvider,
} from "@ku0/shell";
import { Link, Outlet, useLocation, useRouter } from "@tanstack/react-router";
import React from "react";
import { COWORK_SIDEBAR_CONFIG_KEY, COWORK_SIDEBAR_GROUPS } from "../../config/sidebar";
import { CoworkAIPanel } from "../../features/chat/CoworkAIPanel";

function resolveI18nArgs(
  defaultValueOrValues?: string | Record<string, string | number>,
  valuesOrDefault?: Record<string, string | number> | string
) {
  const hasValues = typeof defaultValueOrValues === "object" && defaultValueOrValues !== null;
  const defaultValue =
    typeof defaultValueOrValues === "string"
      ? defaultValueOrValues
      : typeof valuesOrDefault === "string"
        ? valuesOrDefault
        : undefined;
  const values = hasValues
    ? (defaultValueOrValues as Record<string, string | number>)
    : typeof valuesOrDefault === "object" && valuesOrDefault !== null
      ? valuesOrDefault
      : undefined;
  return { defaultValue, values };
}

function interpolate(template: string, values?: Record<string, string | number>) {
  if (!values) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

export function RootLayout() {
  const router = useRouter();
  const location = useLocation();

  // Sidebar State (Physical Layout)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [sidebarWidth, setSidebarWidth] = React.useState(240);

  // AI Panel State
  const [isHydrated, setIsHydrated] = React.useState(false);
  const [isAIPanelVisible, setIsAIPanelVisible] = React.useState(false);
  const [aiPanelWidth, setAIPanelWidth] = React.useState(400);
  const [aiPanelPosition, setAIPanelPosition] = React.useState<"main" | "left" | "right">("right");

  // Load state from localStorage on mount
  React.useEffect(() => {
    const storedVisible = localStorage.getItem("cowork-ai-panel-visible");
    const storedWidth = localStorage.getItem("cowork-ai-panel-width");
    const storedPosition = localStorage.getItem("cowork-ai-panel-position");

    if (storedVisible) {
      setIsAIPanelVisible(storedVisible === "true");
    }
    if (storedWidth) {
      const parsed = Number.parseInt(storedWidth, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        setAIPanelWidth(parsed);
      }
    }
    if (storedPosition && ["main", "left", "right"].includes(storedPosition)) {
      setAIPanelPosition(storedPosition as "main" | "left" | "right");
    }
    setIsHydrated(true);
  }, []);

  // Persist state changes
  React.useEffect(() => {
    if (isHydrated) {
      localStorage.setItem("cowork-ai-panel-visible", String(isAIPanelVisible));
    }
  }, [isAIPanelVisible, isHydrated]);

  React.useEffect(() => {
    if (isHydrated) {
      localStorage.setItem("cowork-ai-panel-width", String(aiPanelWidth));
    }
  }, [aiPanelWidth, isHydrated]);

  React.useEffect(() => {
    if (isHydrated) {
      localStorage.setItem("cowork-ai-panel-position", aiPanelPosition);
    }
  }, [aiPanelPosition, isHydrated]);

  const shellContextValue = React.useMemo(
    () => ({
      user: {
        id: "demo-user",
        displayName: "Demo User", // TODO: Connect to real auth
        avatarUrl: undefined,
      },
      router: {
        push: (url: string) => router.navigate({ to: url }),
        replace: (url: string) => router.navigate({ to: url, replace: true }),
        back: () => window.history.back(),
        forward: () => window.history.forward(),
        pathname: location.pathname,
      },
      locale: "en",
      createDocument: async () => "new-doc-id", // Placeholder
      aiPanel: {
        isVisible: isAIPanelVisible,
        toggle: () => setIsAIPanelVisible((prev) => !prev),
        setVisible: setIsAIPanelVisible,
        width: aiPanelWidth,
        setWidth: setAIPanelWidth,
        position: aiPanelPosition,
        setPosition: setAIPanelPosition,
        isHydrated,
      },
      sidebar: {
        isCollapsed: isSidebarCollapsed,
        toggle: () => setIsSidebarCollapsed((prev) => !prev),
        setCollapsed: setIsSidebarCollapsed,
        width: sidebarWidth,
        setWidth: setSidebarWidth,
      },
      components: {
        Link: ({
          href,
          children,
          ...props
        }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
          <Link to={href} {...props}>
            {children}
          </Link>
        ),
      },
      i18n: {
        t: (
          key: string,
          defaultValueOrValues?: string | Record<string, string | number>,
          valuesOrDefault?: Record<string, string | number> | string
        ) => {
          const { defaultValue, values } = resolveI18nArgs(defaultValueOrValues, valuesOrDefault);
          const dictionary: Record<string, string> = {
            "Sidebar.searchPlaceholder": "Search...",
            "Sidebar.workspace": "Workspace",
            "Sidebar.collapse": "Collapse",
            "Sidebar.create": "New",
            "Sidebar.moreItems": "More",
            "Sidebar.customize": "Customize",

            // Settings Modal
            "Settings.title": "Settings",
            "Settings.close": "Close",
            "Settings.tabNavigation": "Navigation",
            "Settings.tabAppearance": "Appearance",
            "Settings.badgeStyle": "Badge",
            "Settings.badgeStyleCount": "Count",
            "Settings.badgeStyleCountDesc": "Show number of unread items",
            "Settings.badgeStyleDot": "Dot",
            "Settings.badgeStyleDotDesc": "Show a dot for unread items",
            "Settings.collapseBehavior": "Nav",
            "Settings.collapsePeek": "Peek",
            "Settings.collapsePeekDesc": "Sidebar peeks on hover",
            "Settings.collapseRail": "Rail",
            "Settings.collapseRailDesc": "Sidebar shrinks to a rail",
            "Settings.required": "Required",
            "Settings.visibilityAlways": "Always Show",
            "Settings.visibilityWhenBadged": "When Unread",
            "Settings.visibilityHideInMore": "Hide in More",
            "Settings.themeMode": "Theme",
            "Settings.themeLight": "Light",
            "Settings.themeLightDesc": "Classic light",
            "Settings.themeDark": "Dark",
            "Settings.themeDarkDesc": "Classic dark",
            "Settings.themeSystem": "Auto",
            "Settings.themeSystemDesc": "Follow OS",
            "Settings.readerFontSize": "Reader Font Size",
            "Settings.canvasTone": "Canvas Tone",
            "Settings.canvasDefault": "Default",
            "Settings.canvasWarm": "Warm",
            "Settings.canvasSepia": "Sepia",
            "Settings.canvasDark": "Dark",
            "Settings.aiPanelPosition": "AI Panel",
            "Settings.aiPanelMain": "Main",
            "Settings.aiPanelMainDesc": "Show in the primary workspace",
            "Settings.aiPanelLeftRail": "Left",
            "Settings.aiPanelLeftRailDesc": "Dock beside the sidebar",
            "Settings.aiPanelRightRail": "Right",
            "Settings.aiPanelRightRailDesc": "Dock on the right side",
          };
          const resolved = dictionary[key] ?? defaultValue ?? key.split(".").pop() ?? key;
          return interpolate(resolved, values);
        },
      },
    }),
    [
      isSidebarCollapsed,
      sidebarWidth,
      isAIPanelVisible,
      aiPanelWidth,
      aiPanelPosition,
      router,
      location.pathname,
      isHydrated,
    ]
  );

  return (
    <TooltipProvider>
      <ReaderShellProvider
        value={shellContextValue}
        sidebarConfig={{
          initialGroups: COWORK_SIDEBAR_GROUPS,
          configKey: COWORK_SIDEBAR_CONFIG_KEY,
        }}
      >
        <ReaderPreferencesProvider>
          <AppShell rightPanel={<CoworkAIPanel />} appName="KeepUp">
            <Outlet />
          </AppShell>
        </ReaderPreferencesProvider>
      </ReaderShellProvider>
    </TooltipProvider>
  );
}
