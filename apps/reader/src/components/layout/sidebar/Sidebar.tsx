"use client";
import { RssManagementModal } from "@/components/feeds/RssManagementModal";
import { ContentComposer } from "@/components/import/ContentComposer";
import { ImportStatus } from "@/components/import/ImportStatus";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { Tooltip } from "@/components/ui/Tooltip";
import { useImportContextOptional } from "@/context/ImportContext";
import { Link, usePathname } from "@/i18n/navigation";
import type {
  EffectiveSidebarItem,
  EffectiveSidebarState,
  SidebarBadgeStyle,
  SidebarConfigActions,
} from "@/lib/sidebar";
import { cn } from "@keepup/shared/utils";
import { CircleHelp, MoreHorizontal, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { SidebarGroup } from "./SidebarGroup";
import { SidebarHeader } from "./SidebarHeader";

interface SidebarProps {
  className?: string;
  onOpenCustomize?: () => void;
  state: EffectiveSidebarState;
  actions: SidebarConfigActions;
  isLoading: boolean;
  workspaceName?: string;
  workspaceAvatarUrl?: string;
}

export const Sidebar = React.memo(function Sidebar({
  className,
  onOpenCustomize,
  state,
  actions,
  isLoading,
  workspaceName,
  workspaceAvatarUrl,
}: SidebarProps) {
  const pathname = usePathname() || "";
  const t = useTranslations("Sidebar");
  const importContext = useImportContextOptional();
  const [showAddFeedModal, setShowAddFeedModal] = React.useState(false);

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
        className="ml-auto h-5 min-w-5 px-1.5 text-[10px] bg-surface-3 text-muted-foreground"
      >
        {item.badgeCount}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <aside
        className={cn("sidebar flex flex-col w-full h-full bg-surface-1", className)}
        aria-label="Primary sidebar"
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={cn("sidebar flex flex-col w-full h-full bg-surface-1", className)}
      aria-label="Primary sidebar"
    >
      <SidebarHeader workspaceName={workspaceName} workspaceAvatarUrl={workspaceAvatarUrl} />

      <ContentComposer
        open={importContext?.isModalOpen ?? false}
        onOpenChange={(open) => {
          if (!open) {
            importContext?.closeImportModal();
          }
        }}
        prefillUrl={importContext?.prefillUrl}
      />
      <ImportStatus />

      {/* Scrollable Groups */}
      {/* Scrollable Groups */}
      <nav
        aria-label="Sidebar navigation"
        className="flex-1 overflow-y-auto px-2 py-2 space-y-4 scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-border/50 scrollbar-track-transparent outline-none"
      >
        {state.groups.map((group) => (
          <SidebarGroup
            key={group.id}
            id={group.id}
            label={group.label}
            collapsible={group.collapsible}
            collapsed={group.collapsed}
            mainItems={group.mainItems}
            badgeStyle={state.badgeStyle}
            activePath={pathname}
            onToggleCollapse={() => actions.toggleGroupCollapse(group.id)}
            onAddFeed={() => setShowAddFeedModal(true)}
          />
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border/40 flex items-center gap-2">
        {groupsWithMoreItems.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                aria-label={t("moreItems")}
                title={t("moreItems")}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              {groupsWithMoreItems.map((group, index) => (
                <React.Fragment key={group.id}>
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </DropdownMenuLabel>
                  {group.moreItems.map((item) => (
                    <DropdownMenuItem key={item.id} asChild className="cursor-pointer">
                      <Link href={item.route} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4 text-muted-foreground" />
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

        {/* Help */}
        <Tooltip content="Help & Feedback" side="top">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground ml-auto"
            onClick={() =>
              window.open("https://github.com/Start-Rail/English-level-up-tips", "_blank")
            }
            aria-label="Help"
          >
            <CircleHelp className="h-4 w-4" />
          </Button>
        </Tooltip>

        <Tooltip content={t("customize")} side="top">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={onOpenCustomize}
            aria-label={t("customize")}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>

      {/* Add Feed Modal for Sidebar */}
      <RssManagementModal open={showAddFeedModal} onOpenChange={setShowAddFeedModal} />
    </aside>
  );
});
