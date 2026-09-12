import { test, expect, type Page } from "@playwright/test";
import { loginAs, seedMembership, seedOrganization, seedTask, seedUser } from "./support/auth";

async function expectStats(page: Page, values: { total: number; completed: number; pending: number; overdue: number }) {
  const summary = page.getByRole("region", { name: "Task summary" });
  await expect(summary.getByRole("button", { name: `Show tasks assigned: ${values.total}`, exact: true })).toBeVisible();
  for (const status of ["completed", "pending", "overdue"] as const) {
    await expect(summary.getByRole("button", { name: `Show ${status}: ${values[status]}`, exact: true })).toBeVisible();
  }
}

test("a new workspace starts empty and shows only its registered teammates", async ({ page }) => {
  const owner = await loginAs(page);
  await expectStats(page, { total: 0, completed: 0, pending: 0, overdue: 0 });
  await expect(page.getByText("Complete vehicle safety check", { exact: true })).toHaveCount(0);
  const organization = await seedOrganization(page.request, { ownerId: owner.id });
  const colleague = await seedUser(page.request, { name: "Jordan Taylor" });
  await seedMembership(page.request, { organizationId: organization.id, userId: colleague.id, role: "employee" });
  await page.reload();
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Jordan Taylor", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ahmand Edmonds", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sarah Wilson", exact: true })).toHaveCount(0);
});

test("completing a saved overdue task updates totals and the actual actor after reload", async ({ page }) => {
  const owner = await loginAs(page);
  const organization = await seedOrganization(page.request, { ownerId: owner.id });
  const title = "Complete vehicle safety check";
  await seedTask(page.request, { organizationId: organization.id, createdBy: owner.id, title, dueAt: new Date(Date.now() - 3_600_000).toISOString() });
  await page.reload();
  await expectStats(page, { total: 1, completed: 0, pending: 0, overdue: 1 });
  await page.getByRole("button", { name: `Complete ${title}`, exact: true }).click();
  await expectStats(page, { total: 1, completed: 1, pending: 0, overdue: 0 });
  await page.reload();
  await expectStats(page, { total: 1, completed: 1, pending: 0, overdue: 0 });
  await page.getByRole("button", { name: "View recent activity", exact: true }).click();
  const latest = page.getByRole("dialog").locator(".full-activity-item").first();
  await expect(latest).toContainText(title);
  await expect(latest).toContainText("Ahmand Edmonds completed");
});

test("saved tasks remain searchable and filterable by their real assignee", async ({ page }) => {
  const owner = await loginAs(page);
  const organization = await seedOrganization(page.request, { ownerId: owner.id });
  const colleague = await seedUser(page.request, { name: "Jordan Taylor" });
  const membership = await seedMembership(page.request, { organizationId: organization.id, userId: colleague.id, role: "employee" });
  await seedTask(page.request, { organizationId: organization.id, createdBy: owner.id, title: "Evening facility check", assigneeId: membership.id });
  await seedTask(page.request, { organizationId: organization.id, createdBy: owner.id, title: "Morning equipment inspection" });
  await page.reload();
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByRole("combobox", { name: "Filter by team member", exact: true }).selectOption({ label: "Jordan Taylor" });
  await page.getByRole("textbox", { name: "Search tasks", exact: true }).fill("EVENING");
  const row = page.getByRole("row").filter({ hasText: "Evening facility check" });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Jordan");
  await expect(page.getByRole("row").filter({ hasText: "Morning equipment inspection" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search tasks", exact: true }).fill("not a saved task");
  await expect(page.getByRole("heading", { name: "No tasks here just yet", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(row).toHaveCount(1);
});

test("disabled or corrupt browser storage cannot replace online tasks with sample data", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() { throw new DOMException("Storage disabled for this test", "SecurityError"); },
    });
  });
  const owner = await loginAs(page);
  const organization = await seedOrganization(page.request, { ownerId: owner.id });
  const title = "Saved without browser storage";
  await seedTask(page.request, { organizationId: organization.id, createdBy: owner.id, title });
  await page.reload();
  await expectStats(page, { total: 1, completed: 0, pending: 1, overdue: 0 });
  await page.getByRole("button", { name: `Complete ${title}`, exact: true }).click();
  await page.reload();
  await expectStats(page, { total: 1, completed: 1, pending: 0, overdue: 0 });
  await expect(page.getByText("Sample data has been restored.", { exact: false })).toHaveCount(0);
});
