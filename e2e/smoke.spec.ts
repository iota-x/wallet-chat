import { test, expect, type Page } from "@playwright/test";

/**
 * Smoke E2E — the app loads and every operator surface opens without a console
 * error. This is the wiring net: it would have caught a broken panel import, a
 * bad route, or a runtime crash in the verification slip that unit tests miss.
 */

// Skip the first-run onboarding modal so it doesn't overlay the app under test.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("wc-onboarded-v1", "1"));
});

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

test("landing page renders the hero and links into the app", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await expect(page.locator("body")).toContainText(/walletchat/i);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("app loads with the intent console", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/app");
  await expect(page.getByPlaceholder(/connect a wallet to begin|state an intent/i)).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("every operator panel opens", async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => localStorage.setItem("wc-sidebar", "1"));
  await page.goto("/app");

  for (const name of [/portfolio/i, /transactions/i, /addresses/i, /approvals/i, /guardrails/i]) {
    await page.getByRole("button", { name }).click();
    // Scope to the modal overlay (z-[60]) so we don't hit the sidebar's own close.
    const overlay = page.locator('div[class*="z-[60]"]');
    await expect(overlay).toBeVisible();
    await overlay.getByRole("button", { name: "Close" }).first().click();
    await expect(overlay).toHaveCount(0);
  }
  expect(errors, errors.join("\n")).toEqual([]);
});

test("command palette opens and filters", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("wc-sidebar", "1"));
  await page.goto("/app");
  await page.getByRole("button", { name: /command menu/i }).click();
  const input = page.getByPlaceholder(/jump to a chat/i);
  await expect(input).toBeVisible();
  await input.fill("portfolio");
  await expect(page.getByRole("button", { name: /open portfolio/i })).toBeVisible();
});

test("mainnet signing toggle flips on and off", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("wc-sidebar", "1"));
  await page.goto("/app");
  await page.getByRole("button", { name: /guardrails/i }).click();
  const sw = page.getByRole("switch");
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
});
