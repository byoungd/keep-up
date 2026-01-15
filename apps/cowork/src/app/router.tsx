import { QueryClient } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { RootLayout } from "./layouts/RootLayout";
import { HomeRoute } from "./routes/HomeRoute";
import { SessionRoute } from "./routes/SessionRoute";
import { SettingsRoute } from "./routes/SettingsRoute";

export const queryClient = new QueryClient();

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomeRoute,
});

const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sessions/$sessionId",
  component: SessionRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsRoute,
});

const routeTree = rootRoute.addChildren([indexRoute, sessionRoute, settingsRoute]);

export const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export type RouterContext = {
  queryClient: QueryClient;
};
