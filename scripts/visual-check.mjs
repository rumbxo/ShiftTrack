import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:3000/dashboard");
  await page.getByRole("heading", { name: "Welcome back, Ahmand" }).waitFor();
  await page.screenshot({ path: "artifacts/dashboard-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: "artifacts/create-task.png", fullPage: true });
  await page.keyboard.press("Escape");
  for (const width of [390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
    assert.ok(dimensions.page <= dimensions.viewport, `Page overflows at ${width}px: ${JSON.stringify(dimensions)}`);
    if (width === 390) {
      await page.screenshot({ path: "artifacts/dashboard-mobile.png", fullPage: true });
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page.getByRole("button", { name: "Team", exact: true }).click();
      await page.getByRole("heading", { name: "Good people. Great teamwork." }).waitFor();
      await page.getByRole("button", { name: "Add team member", exact: true }).click();
      await page.getByRole("dialog").waitFor();
      await page.screenshot({ path: "artifacts/mobile-team-form.png", fullPage: true });
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page.getByRole("button", { name: "Overview", exact: true }).click();
    }
  }
  assert.deepEqual(errors, [], "No browser runtime errors");
  console.log("Desktop and mobile screenshots saved. No page overflow at 390, 768, or 1024px; mobile navigation and form passed.");
} finally {
  await browser.close();
}
