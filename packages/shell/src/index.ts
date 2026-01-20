// Components

export { ApprovalCard } from "./components/ai/ApprovalCard";
export { AIPanel } from "./components/chat/AIPanel";
export { BackgroundTaskIndicator } from "./components/chat/BackgroundTaskIndicator";
export type { PanelPosition } from "./components/chat/ModelSelector";
export type {
  ActionItem,
  ActiveTask,
  AgentTask,
  ApprovalRiskLevel,
  ArtifactItem,
  Message,
  MessageStatus,
  TaskStep,
} from "./components/chat/types";
export { AppearanceMenu } from "./components/layout/AppearanceMenu";
export { AppShell } from "./components/layout/AppShell";
export { Header } from "./components/layout/Header";
// Types
export type { ResizableThreePaneLayoutHandle } from "./components/layout/ResizableThreePaneLayout";
export { ResizableThreePaneLayout } from "./components/layout/ResizableThreePaneLayout";
export { ResizableSidebar } from "./components/layout/sidebar/ResizableSidebar";
export { SettingsModal } from "./components/layout/sidebar/SettingsModal";
// Sidebar Internal Parts (if needed separately)
export { Sidebar } from "./components/layout/sidebar/Sidebar";
export { SidebarRail } from "./components/layout/sidebar/SidebarRail";
export type {
  SidebarGroupRenderer,
  SidebarGroupRenderProps,
  SidebarItemRenderer,
  SidebarItemRenderProps,
  SidebarNewAction,
} from "./components/layout/sidebar/types";
export type { AgentRun, DashboardMetrics } from "./components/observability/metrics";
export { ObservabilityDashboard } from "./components/observability/ObservabilityDashboard";
export type { ArtifactPreviewPaneProps } from "./components/ui/ArtifactPreviewPane";
export { ArtifactPreviewPane } from "./components/ui/ArtifactPreviewPane";
export type { AvatarProps } from "./components/ui/Avatar";

// UI Components
export { Avatar, avatarVariants } from "./components/ui/Avatar";
export type { BadgeProps } from "./components/ui/Badge";
export { Badge, badgeVariants } from "./components/ui/Badge";
export type { ButtonProps } from "./components/ui/Button";
export { Button, buttonVariants } from "./components/ui/Button";
export type { ButtonGroupProps } from "./components/ui/ButtonGroup";
export { ButtonGroup } from "./components/ui/ButtonGroup";
export type { CardProps } from "./components/ui/Card";
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cardVariants,
} from "./components/ui/Card";
export type { CheckboxProps } from "./components/ui/Checkbox";
export { Checkbox } from "./components/ui/Checkbox";
export type { DialogProps } from "./components/ui/Dialog";
export { Dialog, DialogFooter } from "./components/ui/Dialog";
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./components/ui/DropdownMenu";
export type { EmptyStateAction, EmptyStateProps } from "./components/ui/EmptyState";
export { EmptyState } from "./components/ui/EmptyState";
export type { IconSize } from "./components/ui/Icon";
export { Icon } from "./components/ui/Icon";
export type { InputProps } from "./components/ui/Input";
export { Input } from "./components/ui/Input";
export type { LabelProps } from "./components/ui/Label";
export { Label } from "./components/ui/Label";
export type { ListProps } from "./components/ui/List";
export { List } from "./components/ui/List";
export type { ListRowProps } from "./components/ui/ListRow";
export { ListRow } from "./components/ui/ListRow";
export type { ListSectionProps } from "./components/ui/ListSection";
export { ListSection } from "./components/ui/ListSection";
export type { LoadingStateProps } from "./components/ui/LoadingState";
export { InlineLoadingState, LoadingState, PageLoadingState } from "./components/ui/LoadingState";
export type { NavGroupProps } from "./components/ui/NavGroup";
export { NavGroup } from "./components/ui/NavGroup";
export type { NavSectionProps } from "./components/ui/NavSection";
export { NavSection } from "./components/ui/NavSection";
export { Panel, PanelContent, PanelFooter, PanelHeader, PanelTitle } from "./components/ui/Panel";
export type { RailTab, RailTabPanelProps, RailTabsProps } from "./components/ui/RailTabs";
export { RailTabPanel, RailTabs } from "./components/ui/RailTabs";
export type { SearchInputProps } from "./components/ui/SearchInput";
export { SearchInput } from "./components/ui/SearchInput";
export type { SegmentedControlItem } from "./components/ui/SegmentedControl";
export { SegmentedControl } from "./components/ui/SegmentedControl";
export type { SelectProps } from "./components/ui/Select";
export { Select, SelectOption } from "./components/ui/Select";
export type { SheetProps } from "./components/ui/Sheet";
export { Sheet } from "./components/ui/Sheet";
export {
  SidebarLeftFilledIcon,
  SidebarLeftIcon,
  SidebarRightFilledIcon,
  SidebarRightIcon,
} from "./components/ui/SidebarIcons";
export { Skeleton, SkeletonCard, SkeletonText } from "./components/ui/Skeleton";
export { Slider } from "./components/ui/Slider";
export { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/Tabs";
export { ThemeToggle } from "./components/ui/ThemeToggle";
export type { TooltipProps } from "./components/ui/Tooltip";
export { Tooltip, TooltipProvider } from "./components/ui/Tooltip";
export {
  ReaderPreferencesProvider,
  useReaderPreferences,
} from "./context/ReaderPreferencesContext";
// Context & Hooks
export { ReaderShellProvider, useReaderShell } from "./context/ReaderShellContext";
export type {
  SidebarConfigActions,
  SidebarGroupDefinition,
  SidebarGroupUserConfig,
  SidebarItemDefinition,
  SidebarItemUserConfig,
  SidebarUserConfig,
  SidebarVisibilityPolicy,
} from "./lib/sidebar";
export {
  DEFAULT_BADGE_STYLE,
  DEFAULT_COLLAPSE_MODE,
  DEFAULT_SIDEBAR_GROUPS,
  SIDEBAR_CONFIG_STORAGE_KEY,
  useSidebarConfig,
} from "./lib/sidebar";
