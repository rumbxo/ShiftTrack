import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const baseUrl = "http://127.0.0.1:3000";
const storageState = process.env.SHIFTTRACK_STORAGE_STATE;
const contextOptions = {
  viewport: { width: 1440, height: 1050 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
};
const errors = [];

function watchErrors(page) {
  page.on("pageerror", (error) => errors.push(error.message));
}

async function checkOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    page: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.page <= dimensions.viewport,
    `${label} overflows at ${dimensions.viewport}px: ${JSON.stringify(dimensions)}`,
  );
}

async function capturePublicPage(page, path, title) {
  await page.setViewportSize(contextOptions.viewport);
  const response = await page.goto(`${baseUrl}/${path}`);
  assert.ok(response?.ok(), `${path} should load successfully`);
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await checkOverflow(page, path);
  await page.screenshot({ path: `artifacts/${path}-desktop.png`, fullPage: true });

  for (const width of [390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await checkOverflow(page, path);
    if (width === 390) {
      await page.screenshot({ path: `artifacts/${path}-mobile.png`, fullPage: true });
    }
  }
}

await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch();
try {
  // Public previews always use a fresh session and never submit account forms.
  const publicContext = await browser.newContext(contextOptions);
  const publicPage = await publicContext.newPage();
  watchErrors(publicPage);
  await capturePublicPage(publicPage, "login", "Welcome back.");
  await capturePublicPage(publicPage, "register", "A smoother shift starts here.");
  await publicContext.close();

  if (storageState) {
    // Provide an existing signed-in Playwright storageState file for these views.
    // Keep that file outside Git: it contains session credentials.
    const dashboardContext = await browser.newContext({ ...contextOptions, storageState });
    const page = await dashboardContext.newPage();
    watchErrors(page);
    const response = await page.goto(`${baseUrl}/dashboard`);
    assert.ok(response?.ok(), "Dashboard should load successfully");
    assert.equal(
      new URL(page.url()).pathname,
      "/dashboard",
      "SHIFTTRACK_STORAGE_STATE must contain a valid signed-in session for this app.",
    );
    await page.getByRole("heading", { name: /^Welcome back,/ }).waitFor();
    await checkOverflow(page, "dashboard");
    await page.screenshot({ path: "artifacts/dashboard-desktop.png", fullPage: true });
    await page.getByRole("button", { name: "Create task", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.screenshot({ path: "artifacts/create-task.png", fullPage: true });
    await page.keyboard.press("Escape");

    for (const width of [390, 768, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      await checkOverflow(page, "dashboard");
      if (width !== 390) continue;

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
    await dashboardContext.close();
  }

  assert.deepEqual(errors, [], "No browser runtime errors");
  console.log(
    `${storageState ? "Login, registration, and authenticated dashboard" : "Login and registration"} previews saved in artifacts/. No overflow at 390, 768, 1024, or 1440px; no browser runtime errors.`,
  );
} finally {
  await browser.close();
}
