/**
 * Tab system components for Chrome-style multi-tab and split view.
 *
 * Usage:
 * 1. Wrap your app with <TabProvider>
 * 2. Use <SplitViewContainer renderContent={...} /> for the main content area
 * 3. Add <TabKeyboardShortcuts /> inside the provider for keyboard navigation
 *
 * @example
 * ```tsx
 * import { TabProvider, SplitViewContainer, TabKeyboardShortcuts } from "@/components/tabs";
 *
 * function App() {
 *   return (
 *     <TabProvider>
 *       <TabKeyboardShortcuts />
 *       <SplitViewContainer
 *         renderContent={(tab) => <DocumentView documentId={tab.documentId} />}
 *       />
 *     </TabProvider>
 *   );
 * }
 * ```
 */

export { TabBar, TabItem } from "./TabBar";
export { SplitViewContainer, PaneContainer } from "./SplitViewContainer";
export { TabbedContentArea, useTabControl } from "./TabbedContentArea";
