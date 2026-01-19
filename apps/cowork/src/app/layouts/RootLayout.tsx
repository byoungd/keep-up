import type { ArtifactItem } from "@ku0/shell";
import {
  AppShell,
  ReaderPreferencesProvider,
  ReaderShellProvider,
  type SidebarGroupRenderProps,
  TooltipProvider,
} from "@ku0/shell";
import { Link, Outlet, useLocation, useRouter } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import React from "react";
import { CoworkSidebarSections } from "../../components/sidebar/CoworkSidebarSections";
import { COWORK_SIDEBAR_CONFIG_KEY, COWORK_SIDEBAR_GROUPS } from "../../config/sidebar";
import { AIControlProvider } from "../../features/chat/AIControlContext";
import { AIHeaderActions } from "../../features/chat/AIHeaderActions";
import { CoworkAIPanel } from "../../features/chat/CoworkAIPanel";
import { ContextPanel, type ContextPanelTab } from "../../features/context/ContextPanel";

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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("cowork-sidebar-collapsed");
      return stored === "true";
    }
    return false;
  });
  const [sidebarWidth, setSidebarWidth] = React.useState(240);

  // Auxiliary Panel State
  const [isHydrated, setIsHydrated] = React.useState(false);
  const [isAuxPanelVisible, setIsAuxPanelVisible] = React.useState(false);
  const [auxPanelWidth, setAuxPanelWidth] = React.useState(420);
  const [auxPanelPosition, setAuxPanelPosition] = React.useState<"left" | "right">("right");
  const [contextTab, setContextTab] = React.useState<ContextPanelTab>("artifacts");

  // Preview State
  const [previewArtifact, setPreviewArtifact] = React.useState<ArtifactItem | null>(null);

  // Handlers for preview
  const handlePreviewArtifact = React.useCallback((item: ArtifactItem) => {
    setPreviewArtifact(item);
    setContextTab("preview");
    setIsAuxPanelVisible(true);
  }, []);

  const handleClosePreview = React.useCallback(() => {
    setPreviewArtifact(null);
    setContextTab((prev) => (prev === "preview" ? "artifacts" : prev));
  }, []);

  // Load state from localStorage on mount
  React.useEffect(() => {
    const storedVisible = localStorage.getItem("cowork-aux-panel-visible");
    const storedWidth = localStorage.getItem("cowork-aux-panel-width");
    const storedPosition = localStorage.getItem("cowork-aux-panel-position");

    if (storedVisible) {
      setIsAuxPanelVisible(storedVisible === "true");
    }
    if (storedWidth) {
      const parsed = Number.parseInt(storedWidth, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        setAuxPanelWidth(parsed);
      }
    }
    if (storedPosition && ["left", "right"].includes(storedPosition)) {
      setAuxPanelPosition(storedPosition as "left" | "right");
    }
    setIsHydrated(true);
  }, []);

  // Persist state changes
  React.useEffect(() => {
    if (isHydrated) {
      localStorage.setItem("cowork-aux-panel-visible", String(isAuxPanelVisible));
    }
  }, [isAuxPanelVisible, isHydrated]);

  React.useEffect(() => {
    if (isHydrated) {
      localStorage.setItem("cowork-aux-panel-width", String(auxPanelWidth));
    }
  }, [auxPanelWidth, isHydrated]);

  React.useEffect(() => {
    if (isHydrated) {
      localStorage.setItem("cowork-aux-panel-position", auxPanelPosition);
    }
  }, [auxPanelPosition, isHydrated]);

  // Persist sidebar collapsed state
  React.useEffect(() => {
    localStorage.setItem("cowork-sidebar-collapsed", String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

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
        isVisible: true,
        toggle: () => {
          /* AI panel is always on */
        },
        setVisible: () => {
          /* AI panel is always on */
        },
        width: 0,
        setWidth: () => {
          /* Locked */
        },
        position: "main" as const,
        setPosition: () => {
          /* Locked */
        },
        isHydrated: true,
      },
      auxPanel: {
        isVisible: isAuxPanelVisible,
        toggle: () => setIsAuxPanelVisible((prev) => !prev),
        setVisible: setIsAuxPanelVisible,
        width: auxPanelWidth,
        setWidth: setAuxPanelWidth,
        position: auxPanelPosition,
        setPosition: setAuxPanelPosition,
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
        }: {
          href: string;
          children: React.ReactNode;
          [key: string]: unknown;
        }) => (
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
            "Settings.aiPanelPosition": "Context Panel",
            "Settings.aiPanelLeftRail": "Left",
            "Settings.aiPanelLeftRailDesc": "Dock on the left side",
            "Settings.aiPanelRightRail": "Right",
            "Settings.aiPanelRightRailDesc": "Dock on the right side",

            // Header
            "Header.toggleContext": "Toggle Context Panel (⌘+2)",
          };
          const resolved = dictionary[key] ?? defaultValue ?? key.split(".").pop() ?? key;
          return interpolate(resolved, values);
        },
      },
    }),
    [
      isSidebarCollapsed,
      sidebarWidth,
      isAuxPanelVisible,
      auxPanelWidth,
      auxPanelPosition,
      router,
      location.pathname,
      isHydrated,
    ]
  );

  const contextPanel = (
    <ContextPanel
      activeTab={contextTab}
      onTabChange={setContextTab}
      previewArtifact={previewArtifact}
      onClosePreview={handleClosePreview}
      position={auxPanelPosition}
    />
  );

  // AI Panel with preview callback
  const aiPanelElement = <CoworkAIPanel onPreviewArtifact={handlePreviewArtifact} />;

  const renderSidebarGroup = React.useCallback(
    ({ group, defaultGroup }: SidebarGroupRenderProps) => {
      if (group.id !== "primary") {
        return defaultGroup;
      }
      return (
        <div className="space-y-4">
          {defaultGroup}
          <CoworkSidebarSections />
        </div>
      );
    },
    []
  );

  return (
    <AIControlProvider>
      <TooltipProvider>
        <ReaderShellProvider
          value={shellContextValue}
          sidebarConfig={{
            initialGroups: COWORK_SIDEBAR_GROUPS,
            configKey: COWORK_SIDEBAR_CONFIG_KEY,
          }}
        >
          <ReaderPreferencesProvider>
            <AppShell
              rightPanel={aiPanelElement}
              auxPanel={contextPanel}
              appName="KeepUp"
              sidebarProps={{
                showSearch: false,
                renderGroup: renderSidebarGroup,
                newAction: {
                  label: "New Session",
                  ariaLabel: "New Session",
                  icon: Sparkles,
                  onClick: () => router.navigate({ to: "/new-session" }),
                },
              }}
              layoutStyle="arc"
              headerProps={{
                leftSlot: (
                  <span className="font-semibold text-sm text-foreground">Cowork Agent</span>
                ),
                rightSlot: <AIHeaderActions />,
              }}
            >
              <Outlet />
            </AppShell>
          </ReaderPreferencesProvider>
        </ReaderShellProvider>
      </TooltipProvider>
    </AIControlProvider>
  );
}
