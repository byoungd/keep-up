// Components
export { AppShell } from "./components/layout/AppShell";
export { Header } from "./components/layout/Header";
export { AppearanceMenu } from "./components/layout/AppearanceMenu";
export { ResizableThreePaneLayout } from "./components/layout/ResizableThreePaneLayout";
export { AIPanel } from "./components/chat/AIPanel";

// Sidebar Internal Parts (if needed separately)
export { Sidebar } from "./components/layout/sidebar/Sidebar";
export { SidebarRail } from "./components/layout/sidebar/SidebarRail";
export { ResizableSidebar } from "./components/layout/sidebar/ResizableSidebar";
export { SettingsModal } from "./components/layout/sidebar/SettingsModal";
export type {
  SidebarItemRenderProps,
  SidebarItemRenderer,
} from "./components/layout/sidebar/types";

// Context & Hooks
export { ReaderShellProvider, useReaderShell } from "./context/ReaderShellContext";
export {
  ReaderPreferencesProvider,
  useReaderPreferences,
} from "./context/ReaderPreferencesContext";
export { useSidebarConfig } from "./lib/sidebar";
export type {
  SidebarUserConfig,
  SidebarItemUserConfig,
  SidebarGroupUserConfig,
  SidebarConfigActions,
  SidebarGroupDefinition,
  SidebarItemDefinition,
  SidebarVisibilityPolicy,
} from "./lib/sidebar";
export {
  DEFAULT_BADGE_STYLE,
  DEFAULT_COLLAPSE_MODE,
  DEFAULT_SIDEBAR_GROUPS,
  SIDEBAR_CONFIG_STORAGE_KEY,
} from "./lib/sidebar";

// Types
export type { ResizableThreePaneLayoutHandle } from "./components/layout/ResizableThreePaneLayout";

// UI Components
export { Avatar, avatarVariants } from "./components/ui/Avatar";
export type { AvatarProps } from "./components/ui/Avatar";
export { Badge, badgeVariants } from "./components/ui/Badge";
export type { BadgeProps } from "./components/ui/Badge";
export { Button, buttonVariants } from "./components/ui/Button";
export type { ButtonProps } from "./components/ui/Button";
export { ButtonGroup } from "./components/ui/ButtonGroup";
export type { ButtonGroupProps } from "./components/ui/ButtonGroup";
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  cardVariants,
} from "./components/ui/Card";
export type { CardProps } from "./components/ui/Card";
export { Checkbox } from "./components/ui/Checkbox";
export type { CheckboxProps } from "./components/ui/Checkbox";
export { Dialog, DialogFooter } from "./components/ui/Dialog";
export type { DialogProps } from "./components/ui/Dialog";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from "./components/ui/DropdownMenu";
export { EmptyState } from "./components/ui/EmptyState";
export type { EmptyStateProps, EmptyStateAction } from "./components/ui/EmptyState";
export { Icon } from "./components/ui/Icon";
export type { IconSize } from "./components/ui/Icon";
export { Input } from "./components/ui/Input";
export type { InputProps } from "./components/ui/Input";
export { Label } from "./components/ui/Label";
export type { LabelProps } from "./components/ui/Label";
export { List } from "./components/ui/List";
export type { ListProps } from "./components/ui/List";
export { ListRow } from "./components/ui/ListRow";
export type { ListRowProps } from "./components/ui/ListRow";
export { ListSection } from "./components/ui/ListSection";
export type { ListSectionProps } from "./components/ui/ListSection";
export { LoadingState, PageLoadingState, InlineLoadingState } from "./components/ui/LoadingState";
export type { LoadingStateProps } from "./components/ui/LoadingState";
export { Panel, PanelHeader, PanelFooter, PanelTitle, PanelContent } from "./components/ui/Panel";
export { RailTabs, RailTabPanel } from "./components/ui/RailTabs";
export type { RailTab, RailTabsProps, RailTabPanelProps } from "./components/ui/RailTabs";
export { SearchInput } from "./components/ui/SearchInput";
export type { SearchInputProps } from "./components/ui/SearchInput";
export { SegmentedControl } from "./components/ui/SegmentedControl";
export type { SegmentedControlItem } from "./components/ui/SegmentedControl";
export { NavGroup } from "./components/ui/NavGroup";
export type { NavGroupProps } from "./components/ui/NavGroup";
export { NavSection } from "./components/ui/NavSection";
export type { NavSectionProps } from "./components/ui/NavSection";
export { Select, SelectOption } from "./components/ui/Select";
export type { SelectProps } from "./components/ui/Select";
export { Sheet } from "./components/ui/Sheet";
export type { SheetProps } from "./components/ui/Sheet";
export { Skeleton, SkeletonText, SkeletonCard } from "./components/ui/Skeleton";
export { Slider } from "./components/ui/Slider";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/Tabs";
export { ThemeToggle } from "./components/ui/ThemeToggle";
export { Tooltip, TooltipProvider } from "./components/ui/Tooltip";
export type { TooltipProps } from "./components/ui/Tooltip";

export type { PanelPosition } from "./components/chat/ModelSelector";
export type { Message, MessageStatus } from "./components/chat/MessageItem";
