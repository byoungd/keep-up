import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const repoRoot = path.resolve(process.cwd(), "../..");

export default defineConfig({
  testDir: "./src",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5177",
    cwd: repoRoot,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://localhost:5177",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
