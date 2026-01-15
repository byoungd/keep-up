import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { DesignTokens } from "../components/DesignTokens";
import { config } from "../lib/config";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeProvider } from "./providers/ThemeProvider";
import { WorkspaceProvider } from "./providers/WorkspaceProvider";
import { queryClient, router } from "./router";

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <WorkspaceProvider>
            <DesignTokens />
            <RouterProvider router={router} />
            {config.devTools ? (
              <TanStackRouterDevtools router={router} position="bottom-right" />
            ) : null}
            {config.devTools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
          </WorkspaceProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
