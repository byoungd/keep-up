import { defineConfig } from "@playwright/test";

const DEFAULT_PORT = 3000;
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://localhost:${process.env.PLAYWRIGHT_PORT ?? DEFAULT_PORT}`;

const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "test-auth-secret";
const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? baseURL;

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

const useWebpackDev = (() => {
  if (process.env.PLAYWRIGHT_USE_WEBPACK === "1") {
    return true;
  }
  if (process.env.PLAYWRIGHT_USE_WEBPACK === "0") {
    return false;
  }
  return !process.env.CI;
})();

const devServerCommand = useWebpackDev
  ? "pnpm --filter @keepup/reader dev --webpack"
  : "pnpm dev:reader";

const collabServerEnabled = process.env.CI || process.env.PLAYWRIGHT_COLLAB_SERVER === "1";

export default defineConfig({
  testDir: "e2e",
  /* Maximum time one test can run for. */
  timeout: 60 * 1000,
  expect: {
    /**
     * Maximum time expect() should wait for the condition to be met.
     * For example in `await expect(locator).toHaveText();`
     */
    timeout: 5000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
    },
  },
  snapshotPathTemplate: "{testDir}/__snapshots__/{testFilePath}/{arg}{ext}",
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
  webServer: [
    {
      command: process.env.CI ? "pnpm start:reader" : devServerCommand,
      url: baseURL,
      reuseExistingServer,
      env: {
        PORT: readerPort,
        NEXT_DISABLE_DEV_OVERLAY: "1",
        AUTH_SECRET: authSecret,
        NEXTAUTH_SECRET: authSecret,
        AUTH_URL: authUrl,
        NEXTAUTH_URL: authUrl,
        AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST ?? "1",
        AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID ?? "test-google-id",
        AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET ?? "test-google-secret",
        AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID ?? "test-github-id",
        AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET ?? "test-github-secret",
      },
      timeout: 120000,
    },
    ...(collabServerEnabled
      ? [
          {
            command: process.env.CI
              ? "pnpm --filter @keepup/collab-server start"
              : "pnpm --filter @keepup/collab-server dev",
            url: "http://localhost:3030/health",
            reuseExistingServer,
            timeout: 120000,
          },
        ]
      : []),
  ],
});
