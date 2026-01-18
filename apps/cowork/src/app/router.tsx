import { QueryClient } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { RootLayout } from "./layouts/RootLayout";
import { FoundationRoute } from "./routes/FoundationRoute";
import { HomeRoute } from "./routes/HomeRoute";
import { LibraryRoute } from "./routes/LibraryRoute";
import { NewSessionRoute } from "./routes/NewSessionRoute";
import { SearchRoute } from "./routes/SearchRoute";
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

const newSessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/new-session",
  component: NewSessionRoute,
});

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  component: SearchRoute,
});

const foundationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/foundation",
  component: FoundationRoute,
});

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library",
  component: LibraryRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsRoute,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  sessionRoute,
  newSessionRoute,
  searchRoute,
  foundationRoute,
  libraryRoute,
  settingsRoute,
]);

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
