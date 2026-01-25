import { Hono } from "hono";
import { resolveCurrentUser } from "../utils/currentUser";

export function createUserRoutes() {
  const app = new Hono();

  app.get("/me", (c) => {
    const user = resolveCurrentUser(c);
    return c.json({ ok: true, user });
  });

  return app;
}
