import { defineConfig } from "@playwright/test";

// Configuration for tests that require collab-server
const DEFAULT_PORT = 3000;
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://localhost:${process.env.PLAYWRIGHT_PORT ?? DEFAULT_PORT}`;

const readerPort = (() => {
  try {
    const url = new URL(baseURL);
    if (url.port) {
      return url.port;
    }
    return url.protocol === "https:" ? "443" : "80";
  } catch {
    return String(process.env.PLAYWRIGHT_PORT ?? DEFAULT_PORT);
  }
})();

const reuseExistingServer = (() => {
  const flag = process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER;
  if (flag === "1") {
    return true;
  }
  if (flag === "0") {
    return false;
  }
  return !process.env.CI;
})();

export default defineConfig({
  testDir: "e2e",
  timeout: 60000,
  expect: {
    timeout: 5000,
  },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  workers: process.env.PLAYWRIGHT_WORKERS
    ? Number(process.env.PLAYWRIGHT_WORKERS)
    : process.env.CI
      ? 2
      : 2,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  // Requires both dev:reader AND collab-server
  webServer: [
    {
      command: process.env.CI ? "pnpm start:reader" : "pnpm dev:reader",
      url: baseURL,
      reuseExistingServer,
      env: {
        PORT: readerPort,
        NEXT_DISABLE_DEV_OVERLAY: "1",
      },
      timeout: 120000,
    },
    {
      command: process.env.CI
        ? "pnpm --filter @keepup/collab-server start"
        : "pnpm --filter @keepup/collab-server dev",
      url: "http://localhost:3030/health",
      reuseExistingServer,
      timeout: 120000,
    },
  ],
});
