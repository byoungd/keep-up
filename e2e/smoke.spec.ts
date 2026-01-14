import { expect, test } from "@playwright/test";

/**
 * Smoke Tests - Critical Path Verification
 *
 * These tests verify the most critical user paths work correctly.
 * They should be fast, stable, and run on every PR.
 */

test.describe("Smoke Tests", () => {
  test("home page renders with hero content", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Turn noisy updates into signals" })
    ).toBeVisible();
  });

  test("unread page loads with import CTA when empty", async ({ page }) => {
    await page.goto("/unread", { waitUntil: "domcontentloaded" });

    // Should show the page header
    await expect(page.getByRole("heading", { name: "Unread" })).toBeVisible({ timeout: 10000 });

    // Should show either content list or empty state with import CTA
    const importButton = page.getByRole("button", { name: /import/i });
    const documentList = page.locator("[data-testid='document-list']");

    // Wait for either state to appear
    await expect(importButton.or(documentList)).toBeVisible({ timeout: 15000 });
  });

  test("projects page loads without 404", async ({ page }) => {
    await page.goto("/projects");

    // Should not show 404 page
    await expect(page.getByText("Page not found")).not.toBeVisible();

    // Should show projects header or empty state
    const projectsHeader = page.getByRole("heading", { name: "Projects", level: 1 });
    await expect(projectsHeader).toBeVisible({ timeout: 10000 });
  });

  test("library page loads without 404", async ({ page }) => {
    await page.goto("/library");

    // Should not show 404 page
    await expect(page.getByText("Page not found")).not.toBeVisible();

    // Should show library header
    const libraryHeader = page.getByRole("heading", { name: /library/i });
    await expect(libraryHeader).toBeVisible({ timeout: 10000 });
  });

  test("404 page shows for invalid routes", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-12345", { waitUntil: "domcontentloaded" });

    // Should show 404 page with proper messaging
    await expect(page.getByText("Page not found")).toBeVisible();
    await expect(page.getByText("404 Error")).toBeVisible();

    // Should have navigation options
    await expect(page.getByRole("button", { name: /go back/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /go to unread/i })).toBeVisible();
  });

  test("navigation between main sections works", async ({ page }) => {
    // Start at unread
    await page.goto("/unread", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Unread" })).toBeVisible();

    // Navigate to library (via sidebar or direct)
    await page.goto("/library", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /library/i })).toBeVisible();

    // Navigate to projects
    await page.goto("/projects", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();

    // Navigate back to unread
    await page.goto("/unread", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Unread" })).toBeVisible();
  });
});
