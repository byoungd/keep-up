import type { ArtifactItem } from "@ku0/shell";
import {
  AppShell,
  ReaderPreferencesProvider,
  ReaderShellProvider,
  type SidebarGroupRenderProps,
  TooltipProvider,
} from "@ku0/shell";
import { Link, Outlet, useLocation, useParams, useRouter } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
  useReducedMotion,
} from "framer-motion";
import { Sparkles } from "lucide-react";
import React from "react";
import { createTask, setSessionMode } from "../../api/coworkApi";
import { CommandPalette } from "../../components/CommandPalette";
import { SessionHeaderActions } from "../../components/session/SessionHeaderActions";
import { SessionStatusIndicator } from "../../components/session/SessionStatusIndicator";
import { CoworkSidebarSections } from "../../components/sidebar/CoworkSidebarSections";
import { COWORK_SIDEBAR_CONFIG_KEY, COWORK_SIDEBAR_GROUPS } from "../../config/sidebar";
import { AIControlProvider } from "../../features/chat/AIControlContext";
import { CoworkAIPanel } from "../../features/chat/CoworkAIPanel";
import { generateTaskTitle } from "../../features/chat/utils/textUtils";
import { ContextPanel, type ContextPanelTab } from "../../features/context/ContextPanel";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { isTauriRuntime } from "../../lib/tauriRuntime";

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

type RouterType = ReturnType<typeof useRouter>;

const STATIC_DEEPLINKS: Record<string, string> = {
  new: "/new-session",
  "new-session": "/new-session",
  search: "/search",
  settings: "/settings",
  library: "/library",
  market: "/market",
  lessons: "/lessons",
};

function normalizeDeepLinkPath(url: URL): string {
  const combined = `${url.host}${url.pathname}`.replace(/\/+$/, "");
  const trimmed = combined.startsWith("/") ? combined.slice(1) : combined;
  return trimmed.trim();
}

function resolveSessionRoute(path: string, params: URLSearchParams): string | null {
  if (path.startsWith("sessions/")) {
    const [, sessionId] = path.split("/");
    return sessionId ? `/sessions/${sessionId}` : "/";
  }

  if (path === "session") {
    const sessionId = params.get("id") ?? params.get("sessionId");
    return sessionId ? `/sessions/${sessionId}` : "/";
  }

  return null;
}

function resolveStaticRoute(path: string): string | null {
  const head = path.split("/")[0] ?? "";
  return STATIC_DEEPLINKS[head] ?? null;
}

function mapDeepLinkToRoute(raw: string): string | null {
  try {
    const url = new URL(raw);
    const path = normalizeDeepLinkPath(url);
    if (!path) {
      return "/";
    }

    const sessionRoute = resolveSessionRoute(path, url.searchParams);
    if (sessionRoute) {
      return sessionRoute;
    }

    return resolveStaticRoute(path) ?? "/";
  } catch {
    return null;
  }
}

function useDeepLinkNavigation(routerRef: React.MutableRefObject<RouterType>) {
  React.useEffect(() => {
    if (!isTauriRuntime()) {
      return undefined;
    }

    let active = true;
    const handleLink = (url: string) => {
      const route = mapDeepLinkToRoute(url);
      if (route) {
        void routerRef.current.navigate({ to: route });
      }
    };

    const unlistenPromise = listen<string>("deep-link", (event) => {
      handleLink(event.payload);
    });

    void invoke<string | null>("get_pending_deep_link").then((pending) => {
      if (active && pending) {
        handleLink(pending);
      }
    });

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [routerRef]);
}

export function RootLayout() {
  const router = useRouter();
  const location = useLocation();
  const { sessionId } = useParams({ strict: false }) as { sessionId?: string };
  const resolvedSessionId = sessionId && sessionId !== "undefined" ? sessionId : null;
  const { data: currentUser } = useCurrentUser();
  const reduceMotion = useReducedMotion();

  // Use ref for router to avoid useMemo dependency changes
  const routerRef = React.useRef(router);
  routerRef.current = router;
  useDeepLinkNavigation(routerRef);

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
  const [isExiting, setIsExiting] = React.useState(false);

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

  const handleRunTemplate = React.useCallback(
    async (
      prompt: string,
      mode: "plan" | "build" | "review",
      metadata?: Record<string, unknown>
    ) => {
      if (!resolvedSessionId) {
        throw new Error("Start a session to run a workflow.");
      }
      await setSessionMode(resolvedSessionId, mode);
      await createTask(resolvedSessionId, {
        prompt,
        title: generateTaskTitle(prompt),
        metadata,
      });
    },
    [resolvedSessionId]
  );

  const shellUser = React.useMemo(() => {
    if (!currentUser) {
      return undefined;
    }
    return {
      id: currentUser.id,
      email: currentUser.email,
      fullName: currentUser.fullName ?? currentUser.email ?? currentUser.id,
      imageUrl: currentUser.imageUrl,
      permissions: currentUser.permissions,
    };
  }, [currentUser]);

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

  // Stable router functions using refs
  const stableRouterFns = React.useMemo(
    () => ({
      push: (url: string) => routerRef.current.navigate({ to: url }),
      replace: (url: string) => routerRef.current.navigate({ to: url, replace: true }),
      back: () => window.history.back(),
      forward: () => window.history.forward(),
    }),
    []
  );

  // Stable Link component
  const ShellLink = React.useMemo(() => {
    return function ShellLinkComponent({
      href,
      children,
      ...props
    }: {
      href: string;
      children: React.ReactNode;
      [key: string]: unknown;
    }) {
      return (
        <Link to={href} {...props}>
          {children}
        </Link>
      );
    };
  }, []);

  // Stable sidebar callbacks
  const toggleSidebar = React.useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  // Stable aux panel callbacks
  const toggleAuxPanel = React.useCallback(() => {
    if (isAuxPanelVisible) {
      setIsExiting(true);
      setIsAuxPanelVisible(false);
    } else {
      setIsAuxPanelVisible(true);
    }
  }, [isAuxPanelVisible]);

  // Stable i18n translate function - dictionary is static, no deps needed
  const translateFn = React.useCallback(
    (
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
    []
  );

  const shellContextValue = React.useMemo(
    () => ({
      user: shellUser,
      router: {
        ...stableRouterFns,
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
        isVisible: isAuxPanelVisible || isExiting,
        toggle: toggleAuxPanel,
        setVisible: setIsAuxPanelVisible,
        width: auxPanelWidth,
        setWidth: setAuxPanelWidth,
        position: auxPanelPosition,
        setPosition: setAuxPanelPosition,
        isHydrated,
      },
      sidebar: {
        isCollapsed: isSidebarCollapsed,
        toggle: toggleSidebar,
        setCollapsed: setIsSidebarCollapsed,
        width: sidebarWidth,
        setWidth: setSidebarWidth,
      },
      components: {
        Link: ShellLink,
      },
      i18n: {
        t: translateFn,
      },
    }),
    [
      shellUser,
      isSidebarCollapsed,
      sidebarWidth,
      isAuxPanelVisible,
      isExiting,
      auxPanelWidth,
      auxPanelPosition,
      isHydrated,
      location.pathname,
      // Stable refs - included for correctness but won't cause rebuilds
      stableRouterFns,
      ShellLink,
      toggleSidebar,
      toggleAuxPanel,
      translateFn,
    ]
  );

  const contextPanelMotion = reduceMotion
    ? {
        initial: { opacity: 1, x: 0 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 1, x: 0 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, x: 20 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: 20 },
        transition: { duration: 0.2, ease: "easeInOut" },
      };

  const contextPanel = (
    <AnimatePresence mode="wait" onExitComplete={() => setIsExiting(false)}>
      {isAuxPanelVisible && !isExiting && (
        <motion.div
          key="context-panel"
          className="h-full"
          initial={contextPanelMotion.initial}
          animate={contextPanelMotion.animate}
          exit={contextPanelMotion.exit}
          transition={contextPanelMotion.transition}
        >
          <ContextPanel
            activeTab={contextTab}
            onTabChange={setContextTab}
            previewArtifact={previewArtifact}
            onClosePreview={handleClosePreview}
            position={auxPanelPosition}
            onRunTemplate={handleRunTemplate}
            onToggle={() => {
              setIsExiting(true);
              setIsAuxPanelVisible(false);
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );

  // AI Panel with preview callback
  const aiPanelElement = <CoworkAIPanel onPreviewArtifact={handlePreviewArtifact} />;
  const commandPalette = <CommandPalette />;

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
    <MotionConfig reducedMotion="user">
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
              <LayoutGroup id="artifact-preview">
                <AppShell
                  rightPanel={aiPanelElement}
                  auxPanel={contextPanel}
                  commandPalette={commandPalette}
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
                    rightSlot: (
                      <div className="flex items-center gap-2">
                        {resolvedSessionId ? (
                          <SessionStatusIndicator sessionId={resolvedSessionId} />
                        ) : null}
                        <SessionHeaderActions />
                      </div>
                    ),
                  }}
                >
                  <Outlet />
                </AppShell>
              </LayoutGroup>
            </ReaderPreferencesProvider>
          </ReaderShellProvider>
        </TooltipProvider>
      </AIControlProvider>
    </MotionConfig>
  );
}
