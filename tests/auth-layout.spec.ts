import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./support/auth";

async function expectNoOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
}

test("account screens and signed-in navigation work on desktop and mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mkdir("artifacts", { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({ path: "artifacts/login-desktop.png", fullPage: true });
  await page.getByRole("link", { name: "Create an account", exact: true }).click();
  await expect(page.getByLabel("Full name", { exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/register-desktop.png", fullPage: true });

  for (const width of [390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await expectNoOverflow(page);
    await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeVisible();
    if (width === 390) await page.screenshot({ path: "artifacts/register-mobile.png", fullPage: true });
  }

  await loginAs(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("heading", { name: "Welcome back, Ahmand", exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/dashboard-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoOverflow(page);
  await page.screenshot({ path: "artifacts/dashboard-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const signOut = page.getByRole("button", { name: "Sign out", exact: true });
  await expect(signOut).toBeInViewport();
  await signOut.click();
  await expect(page).toHaveURL(/\/login$/);
  await expectNoOverflow(page);
  await page.screenshot({ path: "artifacts/login-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
