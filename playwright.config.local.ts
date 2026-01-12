import { defineConfig } from "@playwright/test";

const DEFAULT_PORT = 3000;
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://localhost:${process.env.PLAYWRIGHT_PORT ?? DEFAULT_PORT}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  retries: 0,
  reporter: "list",
  workers: 1,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  // No webServer - using existing dev server
});
