import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@ku0/shared/utils";
import { GripVertical } from "lucide-react";
import * as React from "react";
import type {
  SidebarBadgeStyle,
  SidebarCollapseMode,
  SidebarGroupDefinition,
  SidebarItemDefinition,
  SidebarUserConfig,
  SidebarVisibilityPolicy,
} from "../../../../lib/sidebar";
import { OptionCard } from "./OptionCard";
import { SettingsSection } from "./SettingsSection";

// --- Types ---

interface SidebarConfigSectionProps {
  userConfig: SidebarUserConfig;
  onSave: (config: SidebarUserConfig) => void;
  groups: SidebarGroupDefinition[];
  t: (key: string, defaultValue?: string) => string;
  setLiveMessage: (message: string) => void;
}

interface SortableSidebarRowProps {
  item: SidebarItemDefinition;
  visibility: SidebarVisibilityPolicy;
  isLocked: boolean;
  onVisibilityChange: (visibility: SidebarVisibilityPolicy) => void;
  requiredLabel: string;
  visibilityAlwaysLabel: string;
  visibilityWhenBadgedLabel: string;
  visibilityHideInMoreLabel: string;
  onKeyboardReorder?: (direction: "up" | "down") => void;
}

// --- Helper Functions ---

function getOrderedItemIds(group: SidebarGroupDefinition, userConfig: SidebarUserConfig): string[] {
  const configured = userConfig.groups[group.id]?.itemOrder ?? group.items.map((item) => item.id);
  const existing = new Set(configured);
  const missing = group.items.filter((item) => !existing.has(item.id)).map((item) => item.id);
  return [...configured, ...missing];
}

function getOrderedItems(group: SidebarGroupDefinition, orderedItemIds: string[]) {
  const itemMap = new Map(group.items.map((item) => [item.id, item]));
  const orderedItems: SidebarItemDefinition[] = [];
  for (const itemId of orderedItemIds) {
    const item = itemMap.get(itemId);
    if (item) {
      orderedItems.push(item);
    }
  }
  return orderedItems;
}

// --- Sub-Components ---

function SortableSidebarRow({
  item,
  visibility,
  isLocked,
  onVisibilityChange,
  requiredLabel,
  visibilityAlwaysLabel,
  visibilityWhenBadgedLabel,
  visibilityHideInMoreLabel,
  onKeyboardReorder,
}: SortableSidebarRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const selectId = `visibility-${item.id}`;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const isAlt = event.altKey || event.metaKey || event.ctrlKey;
    if (event.key === "ArrowUp" && isAlt) {
      event.preventDefault();
      onKeyboardReorder?.("up");
    }
    if (event.key === "ArrowDown" && isAlt) {
      event.preventDefault();
      onKeyboardReorder?.("down");
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 px-2 py-2 rounded-lg border border-border/50 bg-surface-1",
        isDragging && "bg-surface-2 shadow-sm"
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={`Reorder ${item.label}`}
        className="text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
        onKeyDown={handleKeyDown}
        aria-keyshortcuts="Alt+ArrowUp,Alt+ArrowDown"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <item.icon className="h-4 w-4 text-muted-foreground" />
      <label htmlFor={selectId} className="text-sm text-foreground flex-1">
        {item.label}
      </label>

      {isLocked ? (
        <span className="text-xs text-muted-foreground/60 bg-surface-2 px-2 py-1 rounded">
          {requiredLabel}
        </span>
      ) : (
        <select
          id={selectId}
          value={visibility}
          onChange={(e) => onVisibilityChange(e.target.value as SidebarVisibilityPolicy)}
          className={cn(
            "text-xs bg-surface-2 border border-border rounded px-2 py-1",
            "text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          )}
        >
          <option value="ALWAYS">{visibilityAlwaysLabel}</option>
          <option value="WHEN_BADGED">{visibilityWhenBadgedLabel}</option>
          <option value="HIDE_IN_MORE">{visibilityHideInMoreLabel}</option>
        </select>
      )}
    </div>
  );
}

// --- Main Component ---

export function SidebarConfigSection({
  userConfig,
  onSave,
  groups,
  t,
  setLiveMessage,
}: SidebarConfigSectionProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const twoOptionGridClass = "grid grid-cols-2 gap-2 w-full min-w-0";

  // --- Handlers ---

  const handleBadgeStyleChange = (style: SidebarBadgeStyle) => {
    onSave({ ...userConfig, badgeStyle: style });
  };

  const handleCollapseModeChange = (mode: SidebarCollapseMode) => {
    onSave({ ...userConfig, collapseMode: mode });
  };

  const handleVisibilityChange = (itemId: string, visibility: SidebarVisibilityPolicy) => {
    onSave({
      ...userConfig,
      items: {
        ...userConfig.items,
        [itemId]: {
          ...userConfig.items[itemId],
          visibility,
        },
      },
    });
  };

  const announceReorder = React.useCallback(
    (itemLabel: string, groupLabel: string, direction: "up" | "down") => {
      setLiveMessage(`${itemLabel} moved ${direction === "up" ? "up" : "down"} in ${groupLabel}`);
    },
    [setLiveMessage]
  );

  const moveItem = (
    groupId: string,
    activeId: string,
    overId: string,
    orderedItemIds: string[]
  ) => {
    const oldIndex = orderedItemIds.indexOf(activeId);
    const newIndex = orderedItemIds.indexOf(overId);

    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const nextOrder = arrayMove(orderedItemIds, oldIndex, newIndex);
    const direction = newIndex < oldIndex ? "up" : "down";

    onSave({
      ...userConfig,
      groups: {
        ...userConfig.groups,
        [groupId]: {
          ...userConfig.groups[groupId],
          itemOrder: nextOrder,
        },
      },
    });

    return direction;
  };

  const announceMove = (
    groupId: string,
    orderedItemIds: string[],
    activeId: string,
    groupLabel: string,
    direction: "up" | "down"
  ) => {
    const sourceGroup = groups.find((g) => g.id === groupId);
    if (!sourceGroup) {
      return;
    }

    const movedItem = getOrderedItems(sourceGroup, orderedItemIds).find(
      (item) => item.id === activeId
    );
    if (movedItem) {
      announceReorder(movedItem.label, groupLabel, direction);
    }
  };

  const handleReorder =
    (groupId: string, orderedItemIds: string[], groupLabel: string) => (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }

      const activeId = String(active.id);
      const overId = String(over.id);

      const direction = moveItem(groupId, activeId, overId, orderedItemIds);
      if (direction) {
        announceMove(groupId, orderedItemIds, activeId, groupLabel, direction);
      }
    };

  const handleKeyboardReorder = React.useCallback(
    (
      groupId: string,
      orderedItemIds: string[],
      itemId: string,
      groupLabel: string,
      direction: "up" | "down"
    ) => {
      const currentIndex = orderedItemIds.indexOf(itemId);
      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedItemIds.length) {
        return;
      }

      const nextOrder = arrayMove(orderedItemIds, currentIndex, targetIndex);
      onSave({
        ...userConfig,
        groups: {
          ...userConfig.groups,
          [groupId]: {
            ...userConfig.groups[groupId],
            itemOrder: nextOrder,
          },
        },
      });

      const group = groups.find((g) => g.id === groupId);
      const itemLabel = group?.items.find((item) => item.id === itemId)?.label;
      if (itemLabel) {
        announceReorder(itemLabel, groupLabel, direction);
      }
    },
    [announceReorder, userConfig, onSave, groups]
  );

  // --- Previews ---

  const badgeCountPreview = (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-3 px-1.5 text-micro font-semibold text-foreground">
      12
    </span>
  );

  const badgeDotPreview = (
    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
  );

  const collapsePeekPreview = (
    <div
      className="flex h-6 w-8 gap-0.5 rounded border border-border bg-surface-1 p-px"
      aria-hidden="true"
    >
      <div className="h-full w-[2px] rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
      <div className="flex-1 opacity-20 bg-muted-foreground/10 rounded-[1px]" />
    </div>
  );

  const collapseRailPreview = (
    <div
      className="flex h-6 w-8 gap-1 rounded border border-border bg-surface-1 p-px"
      aria-hidden="true"
    >
      <div className="flex w-2 flex-col gap-0.5 border-r border-border/50 bg-surface-2 p-px">
        <div className="h-1.5 w-1.5 rounded-[1px] bg-primary/40" />
        <div className="h-1.5 w-1.5 rounded-[1px] bg-muted-foreground/20" />
        <div className="h-1.5 w-1.5 rounded-[1px] bg-muted-foreground/20" />
      </div>
      <div className="flex-1 opacity-20 bg-muted-foreground/10 rounded-[1px]" />
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Collapse behavior */}
      <SettingsSection id="collapse-behavior-label" label={t("collapseBehavior", "Collapse")}>
        <div className={twoOptionGridClass}>
          <OptionCard
            title={t("collapsePeek")}
            description={t("collapsePeekDesc")}
            selected={userConfig.collapseMode === "peek"}
            preview={collapsePeekPreview}
            onSelect={() => handleCollapseModeChange("peek")}
            size="sm"
          />
          <OptionCard
            title={t("collapseRail")}
            description={t("collapseRailDesc")}
            selected={userConfig.collapseMode === "rail"}
            preview={collapseRailPreview}
            onSelect={() => handleCollapseModeChange("rail")}
            size="sm"
          />
        </div>
      </SettingsSection>

      {/* Badge Style */}
      <SettingsSection id="badge-style-label" label={t("badgeStyle", "Badge")}>
        <div className={twoOptionGridClass}>
          <OptionCard
            title={t("badgeStyleCount")}
            description={t("badgeStyleCountDesc")}
            selected={userConfig.badgeStyle === "COUNT"}
            preview={badgeCountPreview}
            onSelect={() => handleBadgeStyleChange("COUNT")}
            size="sm"
          />
          <OptionCard
            title={t("badgeStyleDot")}
            description={t("badgeStyleDotDesc")}
            selected={userConfig.badgeStyle === "DOT"}
            preview={badgeDotPreview}
            onSelect={() => handleBadgeStyleChange("DOT")}
            size="sm"
          />
        </div>
      </SettingsSection>

      {/* Groups */}
      {groups.map((group) => {
        const orderedItemIds = getOrderedItemIds(group, userConfig);
        const orderedItems = getOrderedItems(group, orderedItemIds);

        return (
          <div key={group.id} className="space-y-2">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {group.label}
            </h3>
            <DndContext
              id={`dnd-group-${group.id}`}
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleReorder(group.id, orderedItemIds, group.label)}
            >
              <SortableContext items={orderedItemIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {orderedItems.map((item) => {
                    const itemConfig = userConfig.items[item.id];
                    const visibility = itemConfig?.visibility || item.defaultVisibility;
                    const isLocked = item.locked;

                    return (
                      <SortableSidebarRow
                        key={item.id}
                        item={item}
                        visibility={visibility}
                        isLocked={Boolean(isLocked)}
                        requiredLabel={t("required")}
                        visibilityAlwaysLabel={t("visibilityAlways")}
                        visibilityWhenBadgedLabel={t("visibilityWhenBadged")}
                        visibilityHideInMoreLabel={t("visibilityHideInMore")}
                        onVisibilityChange={(nextVisibility) =>
                          handleVisibilityChange(item.id, nextVisibility)
                        }
                        onKeyboardReorder={(direction) =>
                          handleKeyboardReorder(
                            group.id,
                            orderedItemIds,
                            item.id,
                            group.label,
                            direction
                          )
                        }
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        );
      })}
    </div>
  );
}
