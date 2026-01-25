"use client";

import { cn } from "@ku0/shared/utils";
import { CircleHelp, MoreHorizontal, Settings2 } from "lucide-react";
import * as React from "react";
import {
  useShellComponents,
  useShellI18n,
  useShellRouter,
} from "../../../context/ReaderShellContext";
import type {
  EffectiveSidebarItem,
  EffectiveSidebarState,
  SidebarBadgeStyle,
  SidebarConfigActions,
} from "../../../lib/sidebar";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/DropdownMenu";
import { Icon as IconWrapper } from "../../ui/Icon";
import { Tooltip } from "../../ui/Tooltip";
import { SidebarGroup } from "./SidebarGroup";
import { SidebarHeader } from "./SidebarHeader";
import type { SidebarGroupRenderer, SidebarItemRenderer, SidebarNewAction } from "./types";

interface SidebarProps {
  className?: string;
  onOpenCustomize?: () => void;
  onOpenSearch?: () => void;
  onOpenImport?: () => void;
  newAction?: SidebarNewAction;
  state: EffectiveSidebarState;
  actions: SidebarConfigActions;
  isLoading: boolean;
  workspaceName?: string;
  workspaceAvatarUrl?: string;
  // Slots for modals/providers that wrap the sidebar logic or are triggered by it
  onOpenFeedModal?: () => void;
  importModals?: React.ReactNode;
  importStatus?: React.ReactNode;
  renderItemChildren?: SidebarItemRenderer;
  renderGroup?: SidebarGroupRenderer;
  showSearch?: boolean;
  isPeeking?: boolean;
  onPin?: () => void;
}

export const Sidebar = React.memo(function Sidebar({
  className,
  onOpenCustomize,
  onOpenSearch,
  onOpenImport,
  newAction,
  state,
  actions,
  isLoading,
  workspaceName,
  workspaceAvatarUrl,
  onOpenFeedModal,
  importModals,
  importStatus,
  renderItemChildren,
  renderGroup,
  showSearch,
}: SidebarProps) {
  const router = useShellRouter();
  const components = useShellComponents();
  const i18n = useShellI18n();
  const { pathname } = router;
  const { Link } = components;

  const t = (key: string) => i18n.t(`Sidebar.${key}`, key);
  // const [showAddFeedModal, setShowAddFeedModal] = React.useState(false); // Controlled by parent if needed

  const groupsWithMoreItems = React.useMemo(
    () => state.groups.filter((group) => group.moreItems.length > 0),
    [state.groups]
  );

  const renderMoreBadge = (item: EffectiveSidebarItem, badgeStyle: SidebarBadgeStyle) => {
    if (item.badgeCount <= 0) {
      return null;
    }

    if (badgeStyle === "DOT") {
      return (
        <span
          className="ml-auto h-2 w-2 rounded-full bg-primary"
          title={`${item.badgeCount} updates`}
        />
      );
    }

    return (
      <Badge
        variant="secondary"
        className="ml-auto h-5 min-w-5 px-1.5 text-micro bg-surface-3 text-muted-foreground"
      >
        {item.badgeCount}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <aside
        className={cn("sidebar flex flex-col w-full h-full", className)}
        aria-label="Primary sidebar"
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full" />
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={cn("sidebar flex flex-col w-full h-full", className)}
      aria-label="Primary sidebar"
    >
      <SidebarHeader
        workspaceName={workspaceName}
        workspaceAvatarUrl={workspaceAvatarUrl}
        onOpenSearch={onOpenSearch}
        onOpenImport={onOpenImport ?? onOpenFeedModal}
        newAction={newAction}
        showSearch={showSearch}
      />

      {importModals}
      {importStatus}

      {/* Scrollable Groups */}

      {/* Pinned Groups (Non-scrollable) */}
      <div className="px-2 pt-2 space-y-4">
        {state.groups
          .filter((g) => g.id === "pinned")
          .map((group) => {
            const defaultGroup = (
              <SidebarGroup
                id={group.id}
                label={group.label}
                collapsible={group.collapsible}
                collapsed={group.collapsed}
                mainItems={group.mainItems}
                badgeStyle={state.badgeStyle}
                activePath={pathname}
                onToggleCollapse={() => actions.toggleGroupCollapse(group.id)}
                renderItemChildren={renderItemChildren}
              />
            );
            const rendered =
              renderGroup?.({
                group,
                defaultGroup,
                badgeStyle: state.badgeStyle,
                activePath: pathname,
              }) ?? defaultGroup;

            return <React.Fragment key={group.id}>{rendered}</React.Fragment>;
          })}
      </div>

      {/* Scrollable Groups */}
      <nav
        aria-label="Sidebar navigation"
        className={cn(
          "flex-1 overflow-y-auto scrollbar-auto-hide px-3 py-2 space-y-4 outline-none"
        )}
      >
        {state.groups
          .filter((g) => g.id !== "pinned")
          .map((group) => {
            const defaultGroup = (
              <SidebarGroup
                id={group.id}
                label={group.label}
                collapsible={group.collapsible}
                collapsed={group.collapsed}
                mainItems={group.mainItems}
                badgeStyle={state.badgeStyle}
                activePath={pathname}
                onToggleCollapse={() => actions.toggleGroupCollapse(group.id)}
                renderItemChildren={renderItemChildren}
              />
            );
            const rendered =
              renderGroup?.({
                group,
                defaultGroup,
                badgeStyle: state.badgeStyle,
                activePath: pathname,
              }) ?? defaultGroup;

            return <React.Fragment key={group.id}>{rendered}</React.Fragment>;
          })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 flex items-center">
        <div className="flex items-center gap-2">
          {groupsWithMoreItems.length > 0 && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors duration-fast"
                  aria-label={t("moreItems")}
                  title={t("moreItems")}
                >
                  <IconWrapper size="lg" aria-hidden="true">
                    <MoreHorizontal />
                  </IconWrapper>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                {groupsWithMoreItems.map((group, index) => (
                  <React.Fragment key={group.id}>
                    <DropdownMenuLabel className="text-micro uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </DropdownMenuLabel>
                    {group.moreItems.map((item) => (
                      <DropdownMenuItem key={item.id} asChild className="cursor-pointer">
                        <Link href={item.route} className="flex items-center gap-2">
                          <IconWrapper
                            size="sm"
                            aria-hidden="true"
                            className="text-muted-foreground"
                          >
                            <item.icon />
                          </IconWrapper>
                          <span className="text-sm">{item.label}</span>
                          {renderMoreBadge(item, state.badgeStyle)}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                    {index < groupsWithMoreItems.length - 1 && <DropdownMenuSeparator />}
                  </React.Fragment>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Tooltip content={t("customize")} side="top">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors duration-fast"
              onClick={onOpenCustomize}
              aria-label={t("customize")}
            >
              <IconWrapper size="lg" aria-hidden="true">
                <Settings2 />
              </IconWrapper>
            </Button>
          </Tooltip>
        </div>

        {/* Help */}
        <div className="ml-auto">
          <Tooltip content="Help & Feedback" side="top">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors duration-fast"
              onClick={() =>
                window.open("https://github.com/Start-Rail/English-level-up-tips", "_blank")
              }
              aria-label="Help"
            >
              <IconWrapper size="lg" aria-hidden="true">
                <CircleHelp />
              </IconWrapper>
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Add Feed Modal handled by parent via onOpenFeedModal */}
    </aside>
  );
});
