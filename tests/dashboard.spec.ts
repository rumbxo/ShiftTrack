import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "./support/auth";

const storagePrefix = "shifttrack-demo-v1:";
const vehicleTask = "Complete vehicle safety check";

async function expectStats(
  page: Page,
  values: { total: number; completed: number; pending: number; overdue: number },
) {
  const summary = page.getByRole("region", { name: "Task summary" });
  await expect(
    summary.getByRole("button", {
      name: `Show tasks assigned: ${values.total}`,
      exact: true,
    }),
  ).toBeVisible();
  for (const status of ["completed", "pending", "overdue"] as const) {
    await expect(
      summary.getByRole("button", {
        name: `Show ${status}: ${values[status]}`,
        exact: true,
      }),
    ).toBeVisible();
  }
}

async function openMemberForm(page: Page) {
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page.getByRole("button", { name: "Add team member", exact: true }).click();
  return page.getByRole("dialog");
}

test("completing an overdue task updates totals and activity and survives reload", async ({ page }) => {
  await loginAs(page);
  await expectStats(page, { total: 12, completed: 8, pending: 3, overdue: 1 });
  await expect(page.getByRole("img", { name: "67% of tasks completed" })).toBeVisible();

  await page.getByRole("button", { name: `Complete ${vehicleTask}`, exact: true }).click();

  await expectStats(page, { total: 12, completed: 9, pending: 3, overdue: 0 });
  await expect(page.getByRole("img", { name: "75% of tasks completed" })).toBeVisible();
  await page.getByRole("button", { name: "View recent activity", exact: true }).click();
  const latestActivity = page.getByRole("dialog").locator(".full-activity-item").first();
  await expect(latestActivity).toContainText(vehicleTask);
  await expect(latestActivity).toContainText("Daniel Kim completed");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.reload();
  await expectStats(page, { total: 12, completed: 9, pending: 3, overdue: 0 });
  await expect(page.getByRole("img", { name: "75% of tasks completed" })).toBeVisible();
  await page.getByRole("button", { name: "View recent activity", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".full-activity-item").first()).toContainText(vehicleTask);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "View all tasks", exact: true }).click();
  await page.getByRole("textbox", { name: "Search tasks", exact: true }).fill(vehicleTask);
  const row = page.getByRole("row").filter({ hasText: vehicleTask });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole("cell", { name: "Completed", exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: `${vehicleTask} is completed`, exact: true })).toBeDisabled();
});

test("a new teammate can receive a task that remains searchable and assigned after reload", async ({ page }) => {
  await loginAs(page);
  const memberDialog = await openMemberForm(page);
  await memberDialog.getByRole("textbox", { name: "Full name", exact: true }).fill("Jordan Taylor");
  await memberDialog.getByRole("textbox", { name: "Email address", exact: true }).fill("jordan@example.com");
  await memberDialog.getByRole("button", { name: "Add team member", exact: true }).click();
  await expect(memberDialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Jordan Taylor", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  const taskDialog = page.getByRole("dialog");
  const title = "Evening facility check";
  await taskDialog.getByRole("textbox", { name: "Task name", exact: true }).fill(title);
  await taskDialog.getByRole("textbox", { name: /Description/ }).fill("Check shared areas and secure the supply cupboard.");
  await taskDialog.getByRole("combobox", { name: "Category", exact: true }).selectOption("Safety");
  await taskDialog.getByRole("combobox", { name: "Assign to", exact: true }).selectOption({ label: "Jordan Taylor" });
  await taskDialog.getByRole("combobox", { name: "Frequency", exact: true }).selectOption("once");
  await taskDialog.getByLabel("Due time", { exact: true }).fill("18:30");
  await taskDialog.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(taskDialog).not.toBeVisible();
  await expectStats(page, { total: 13, completed: 8, pending: 4, overdue: 1 });

  await page.getByRole("button", { name: "View all tasks", exact: true }).click();
  await page.getByRole("combobox", { name: "Filter by team member", exact: true }).selectOption({ label: "Jordan Taylor" });
  await page.getByRole("button", { name: "Show pending: 4", exact: true }).click();
  await page.getByRole("textbox", { name: "Search tasks", exact: true }).fill("EVENING");
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Jordan");
  await expect(row.getByRole("cell", { name: "Pending", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search tasks", exact: true }).fill("a task that does not exist");
  await expect(page.getByRole("heading", { name: "No tasks here just yet", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(row).toHaveCount(1);

  await page.reload();
  await expectStats(page, { total: 13, completed: 8, pending: 4, overdue: 1 });
  await page.getByRole("button", { name: "View all tasks", exact: true }).click();
  await page.getByRole("combobox", { name: "Filter by team member", exact: true }).selectOption({ label: "Jordan Taylor" });
  await page.getByRole("textbox", { name: "Search tasks", exact: true }).fill(title);
  await expect(row).toHaveCount(1);
  await row.getByText(title, { exact: true }).click();
  const details = page.getByRole("dialog");
  await expect(details.getByText("Jordan Taylor", { exact: true })).toBeVisible();
  await expect(details.getByText("Check shared areas and secure the supply cupboard.", { exact: true })).toBeVisible();
  await expect(details.getByText("6:30 PM", { exact: true })).toBeVisible();
  await expect(details.getByText("One-time", { exact: true })).toBeVisible();
});

test("member errors stay in the form, settings persist, and reset restores the sample", async ({ page }) => {
  await loginAs(page);
  const dialog = await openMemberForm(page);
  await dialog.getByRole("textbox", { name: "Full name", exact: true }).fill("Jordan Taylor");
  await dialog.getByRole("textbox", { name: "Email address", exact: true }).fill("jordan@example");
  await dialog.getByRole("button", { name: "Add team member", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("Enter a valid email address");

  await dialog.getByRole("textbox", { name: "Email address", exact: true }).fill("SARAH@example.com");
  await dialog.getByRole("button", { name: "Add team member", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveText("That email is already on your team.");

  await dialog.getByRole("textbox", { name: "Email address", exact: true }).fill("jordan@example.com");
  await dialog.getByRole("button", { name: "Add team member", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(6);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: `Complete ${vehicleTask}`, exact: true }).click();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("textbox", { name: "Demo owner name", exact: true }).fill("Avery Morgan");
  await page.getByRole("textbox", { name: "Organization name", exact: true }).fill("Maple House Team");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Workspace details saved.");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome back, Ahmand", exact: true })).toBeVisible();
  await expect(page.getByText("Maple House Team", { exact: true })).toBeVisible();
  await expectStats(page, { total: 12, completed: 9, pending: 3, overdue: 0 });

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Demo owner name", exact: true })).toHaveValue("Avery Morgan");
  await expect(page.getByRole("textbox", { name: "Organization name", exact: true })).toHaveValue("Maple House Team");
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Keep my changes", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Demo owner name", exact: true })).toHaveValue("Avery Morgan");
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset demo", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Welcome back, Ahmand", exact: true })).toBeVisible();
  await expect(page.getByText("Oak Street Group Home", { exact: true })).toBeVisible();
  await expectStats(page, { total: 12, completed: 8, pending: 3, overdue: 1 });
  await page.reload();
  await expectStats(page, { total: 12, completed: 8, pending: 3, overdue: 1 });
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(5);
  await expect(page.getByRole("heading", { name: "Jordan Taylor", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Ahmand Edmonds", exact: true })).toBeVisible();
});

test("corrupted saved data falls back to usable sample data", async ({ page }) => {
  const identity = await loginAs(page);
  await page.evaluate((key) => {
    window.localStorage.setItem(key, "{broken-json");
  }, storagePrefix + identity.id);
  await page.reload();

  await expect(page.getByRole("status")).toContainText("Sample data has been restored.");
  await expectStats(page, { total: 12, completed: 8, pending: 3, overdue: 1 });
  await page.getByRole("button", { name: `Complete ${vehicleTask}`, exact: true }).click();
  await expectStats(page, { total: 12, completed: 9, pending: 3, overdue: 0 });
  await expect(page.getByText("Sample data has been restored.", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "75% of tasks completed" })).toBeVisible();
});

test("unavailable browser storage still allows task changes during the session", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage disabled for this test", "SecurityError");
      },
    });
  });
  await loginAs(page);

  await expect(page.getByRole("status")).toContainText("Browser storage is unavailable");
  await expectStats(page, { total: 12, completed: 8, pending: 3, overdue: 1 });
  await page.getByRole("button", { name: `Complete ${vehicleTask}`, exact: true }).click();
  await expectStats(page, { total: 12, completed: 9, pending: 3, overdue: 0 });
  await expect(page.getByRole("status").filter({ hasText: "could not be saved" })).toBeVisible();

  await page.getByRole("button", { name: "Create task", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Task name", exact: true }).fill("Session supply check");
  await dialog.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expectStats(page, { total: 13, completed: 9, pending: 4, overdue: 0 });
  await page.getByRole("button", { name: "View all tasks", exact: true }).click();
  await page.getByRole("textbox", { name: "Search tasks", exact: true }).fill("Session supply check");
  await expect(page.getByRole("row").filter({ hasText: "Session supply check" })).toHaveCount(1);
  await expect(page.getByText("Available this session", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View recent activity", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".full-activity-item").first()).toContainText("Session supply check");
});
