import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  appOrigin,
  authFixtureOrigin,
  loginAs,
  savedTasks,
  seedMembership,
  seedOrganization,
  seedTask,
  seedUser,
  taskInput,
  taskMutation,
} from "./support/auth";

async function createThroughForm(page: Page, title: string, assignee?: string) {
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Task name", { exact: true }).fill(title);
  await dialog.getByRole("textbox", { name: /Description/ }).fill("Check shared areas and secure the supply cupboard.");
  await dialog.getByRole("combobox", { name: "Category", exact: true }).selectOption("Safety");
  if (assignee) await dialog.getByRole("combobox", { name: "Assign to", exact: true }).selectOption({ label: assignee });
  await dialog.getByRole("combobox", { name: "Frequency", exact: true }).selectOption("once");
  await dialog.getByLabel("Due date and time", { exact: true }).fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 16));
  await dialog.getByRole("button", { name: "Create task", exact: true }).click();
  return dialog;
}

test("an owner creates an assigned task that another browser reads and completes", async ({ page, browser }) => {
  const owner = await loginAs(page);
  const organization = await seedOrganization(page.request, { ownerId: owner.id });
  const employee = await seedUser(page.request, { name: "Jordan Taylor" });
  const membership = await seedMembership(page.request, { organizationId: organization.id, userId: employee.id, role: "employee" });
  await page.reload();
  const title = "Shared evening facility check";
  const form = await createThroughForm(page, title, employee.name);
  await expect(form).not.toBeVisible();
  const ownerSnapshot = await savedTasks(page.request);
  expect(ownerSnapshot.tasks).toHaveLength(1);
  expect(ownerSnapshot.tasks[0]).toMatchObject({ title, assigneeId: membership.id, completedAt: null });

  const employeeContext = await browser.newContext({ baseURL: appOrigin });
  try {
    const employeePage = await employeeContext.newPage();
    await loginAs(employeePage, employee);
    await employeePage.reload();
    await expect(employeePage.getByRole("button", { name: `Complete ${title}`, exact: true })).toBeEnabled();
    await expect(employeePage.getByRole("button", { name: "Create task", exact: true })).toHaveCount(0);
    await employeePage.getByRole("button", { name: `Complete ${title}`, exact: true }).click();
    await expect(employeePage.getByRole("button", { name: "Show completed: 1", exact: true })).toBeVisible();
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("button", { name: "Show completed: 1", exact: true })).toBeVisible();
    const completed = await savedTasks(page.request);
    expect(completed.tasks[0]).toMatchObject({ id: ownerSnapshot.tasks[0].id, completedBy: employee.id });
    expect(completed.tasks[0].completedAt).not.toBeNull();
  } finally {
    await employeeContext.close();
  }
});

test("employees can read colleagues' tasks but cannot complete unassigned work or manage tasks", async ({ page, browser }) => {
  const owner = await loginAs(page);
  const organization = await seedOrganization(page.request, { ownerId: owner.id });
  const employee = await seedUser(page.request, { name: "Jordan Taylor" });
  await seedMembership(page.request, { organizationId: organization.id, userId: employee.id, role: "employee" });
  const unassigned = await seedTask(page.request, { organizationId: organization.id, createdBy: owner.id, title: "Unassigned shared check" });
  const employeeContext = await browser.newContext({ baseURL: appOrigin });
  try {
    const employeePage = await employeeContext.newPage();
    await loginAs(employeePage, employee);
    const snapshot = await savedTasks(employeePage.request);
    expect(snapshot.tasks.map((task) => task.id)).toContain(unassigned.id);
    const button = employeePage.getByRole("button", { name: `Complete ${unassigned.title}`, exact: true });
    await expect(button).toBeDisabled();
    for (const [path, data] of [
      ["", taskInput({ title: "Unauthorized new task" })],
      ["/update", { ...taskInput({ title: "Unauthorized edit" }), taskId: unassigned.id }],
      ["/complete", { taskId: unassigned.id }],
      ["/delete", { taskId: unassigned.id }],
    ] as const) {
      const response = await taskMutation(employeePage.request, path, data);
      expect(response.status(), path).toBe(403);
    }
    expect((await savedTasks(page.request)).tasks).toEqual(snapshot.tasks);
  } finally {
    await employeeContext.close();
  }
});

test("managers can assign, edit, and delete pending tasks from the dashboard", async ({ page }) => {
  const owner = await seedUser(page.request);
  const organization = await seedOrganization(page.request, { ownerId: owner.id });
  const manager = await seedUser(page.request, { name: "Morgan Manager" });
  await seedMembership(page.request, { organizationId: organization.id, userId: manager.id, role: "manager" });
  const employee = await seedUser(page.request, { name: "Jordan Taylor" });
  const membership = await seedMembership(page.request, { organizationId: organization.id, userId: employee.id, role: "employee" });
  await loginAs(page, manager);
  const originalTitle = "Manager supply check";
  await expect(await createThroughForm(page, originalTitle, employee.name)).not.toBeVisible();
  const created = (await savedTasks(page.request)).tasks[0];
  expect(created.assigneeId).toBe(membership.id);
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByRole("row").filter({ hasText: originalTitle }).getByText(originalTitle, { exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Edit task", exact: true }).click();
  const edit = page.getByRole("dialog");
  await edit.getByLabel("Task name", { exact: true }).fill("Updated manager supply check");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(edit).not.toBeVisible();
  await page.reload();
  expect((await savedTasks(page.request)).tasks[0]).toMatchObject({ id: created.id, title: "Updated manager supply check", assigneeId: membership.id });
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByRole("row").filter({ hasText: "Updated manager supply check" }).getByText("Updated manager supply check", { exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete task", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete task", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  expect((await savedTasks(page.request)).tasks).toEqual([]);
});

test("workspace boundaries reject forged task IDs and assignees", async ({ page }) => {
  const owner = await loginAs(page);
  const organization = await seedOrganization(page.request, { ownerId: owner.id });
  const ownTask = await seedTask(page.request, { organizationId: organization.id, createdBy: owner.id, title: "Private to this workspace" });
  const otherOwner = await seedUser(page.request);
  const otherOrganization = await seedOrganization(page.request, { ownerId: otherOwner.id });
  const otherEmployee = await seedUser(page.request);
  const otherMembership = await seedMembership(page.request, { organizationId: otherOrganization.id, userId: otherEmployee.id, role: "employee" });
  const otherTask = await seedTask(page.request, { organizationId: otherOrganization.id, createdBy: otherOwner.id, title: "Other workspace task" });
  expect((await savedTasks(page.request)).tasks.map((task) => task.id)).toEqual([ownTask.id]);
  for (const [path, data] of [
    ["/update", { ...taskInput({ title: "Cross-workspace edit" }), taskId: otherTask.id }],
    ["/complete", { taskId: otherTask.id }],
    ["/delete", { taskId: otherTask.id }],
  ] as const) expect((await taskMutation(page.request, path, data)).status(), path).toBe(403);
  expect((await taskMutation(page.request, "", taskInput({ title: "Wrong assignee", assigneeId: otherMembership.id }))).status()).toBe(400);
  const extraOrganization = await taskMutation(page.request, "", { ...taskInput({ title: "Forged workspace" }), organizationId: otherOrganization.id });
  expect(extraOrganization.status()).toBe(400);
  expect((await savedTasks(page.request)).tasks.map((task) => task.id)).toEqual([ownTask.id]);
});

test("task endpoints reject anonymous, cross-origin, and invalid requests", async ({ page, request }) => {
  expect((await request.get("/api/tasks")).status()).toBe(401);
  expect((await taskMutation(request, "", taskInput({ title: "Anonymous task" }))).status()).toBe(401);
  await loginAs(page);
  for (const path of ["", "/update", "/complete", "/delete"]) {
    const response = await page.request.post(`/api/tasks${path}`, { headers: { Origin: "https://example.com" }, data: taskInput({ title: "Cross-origin task" }) });
    expect(response.status(), path).toBe(403);
  }
  for (const data of [
    taskInput({ title: " " }),
    taskInput({ title: "Invalid time", dueAt: "not-a-date" }),
    taskInput({ title: "Invalid timezone", timeZone: "Mars/Olympus" }),
    { ...taskInput({ title: "Invalid frequency" }), frequency: "every-minute" },
    { ...taskInput({ title: "Forged completion" }), completedAt: new Date().toISOString() },
  ]) expect((await taskMutation(page.request, "", data)).status()).toBe(400);
  expect((await savedTasks(page.request)).tasks).toEqual([]);
});

test("an open task draft cannot save into another account's workspace after cookies change", async ({ page }) => {
  const first = await loginAs(page, { name: "Riley Morgan" });
  const firstSnapshot = await savedTasks(page.request);
  const second = await seedUser(page.request, { name: "Casey Taylor" });
  await seedOrganization(page.request, { ownerId: second.id });
  await expect(page.getByRole("button", { name: "Refresh tasks", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Task name", { exact: true }).fill("Draft for Riley’s workspace");

  // An API login replaces the shared cookies without navigating this page or
  // sending the login form's storage event, as an external auth callback can.
  const switched = await page.request.post("/api/auth/login", { headers: { Origin: appOrigin }, data: { email: second.email, password: second.password } });
  expect(switched.ok()).toBeTruthy();
  const [rejected] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/tasks") && response.request().method() === "POST"),
    form.getByRole("button", { name: "Create task", exact: true }).click(),
  ]);
  expect(rejected.status()).toBe(403);
  expect(await rejected.json()).toMatchObject({ code: "stale-workspace" });
  const firstMembership = firstSnapshot.members.find((member) => member.userId === first.id)!;
  expect(rejected.request().headers()["x-shifttrack-membership"]).toBe(firstMembership.id);
  await expect(form.getByRole("alert")).toContainText("workspace access changed");
  expect((await savedTasks(page.request)).tasks).toEqual([]);
  const restored = await page.request.post("/api/auth/login", { headers: { Origin: appOrigin }, data: { email: first.email, password: first.password } });
  expect(restored.ok()).toBeTruthy();
  expect((await savedTasks(page.request)).tasks).toEqual([]);
});

test("editing only a recurring task's title preserves its precise due time across a DST overlap", async ({ browser, request }) => {
  const owner = await seedUser(request);
  const organization = await seedOrganization(request, { ownerId: owner.id });
  // New York's second 01:30 that morning is EST. Re-parsing a minute-only local
  // input would choose the earlier EDT occurrence and lose fractional seconds.
  const originalDueAt = "2026-11-01T06:30:45.123456Z";
  const task = await seedTask(request, { organizationId: organization.id, createdBy: owner.id, title: "Precise recurring check", dueAt: originalDueAt, frequency: "monthly", timeZone: "America/New_York" });
  const context = await browser.newContext({ baseURL: appOrigin, timezoneId: "America/New_York" });
  try {
    const page = await context.newPage();
    await loginAs(page, owner);
    await page.getByRole("row").filter({ hasText: task.title }).getByText(task.title, { exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Edit task", exact: true }).click();
    const form = page.getByRole("dialog");
    await expect(form.getByLabel("Due date and time", { exact: true })).toHaveValue("2026-11-01T01:30");
    await form.getByLabel("Task name", { exact: true }).fill("Renamed precise recurring check");
    const [updated] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/api/tasks/update") && response.request().method() === "POST"),
      form.getByRole("button", { name: "Save changes", exact: true }).click(),
    ]);
    expect(updated.ok(), await updated.text()).toBeTruthy();
    expect(updated.request().postDataJSON()).toMatchObject({ dueAt: originalDueAt });
    await expect(form).not.toBeVisible();
    expect((await savedTasks(page.request)).tasks[0]).toMatchObject({ id: task.id, dueAt: originalDueAt, title: "Renamed precise recurring check" });
  } finally {
    await context.close();
  }
});

test("periodic task refresh removes revoked workspace data without needing a focus event", async ({ page, browser }) => {
  const owner = await loginAs(page);
  const organization = await seedOrganization(page.request, { ownerId: owner.id });
  const employee = await seedUser(page.request, { name: "Jordan Taylor" });
  const membership = await seedMembership(page.request, { organizationId: organization.id, userId: employee.id, role: "employee" });
  await seedTask(page.request, { organizationId: organization.id, createdBy: owner.id, title: "Workspace task before removal", assigneeId: membership.id });
  const context = await browser.newContext({ baseURL: appOrigin });
  try {
    const employeePage = await context.newPage();
    await employeePage.clock.install();
    await loginAs(employeePage, employee);
    await expect(employeePage.getByRole("button", { name: "Show tasks assigned: 1", exact: true })).toBeVisible();
    await expect(employeePage.getByRole("button", { name: "Refresh tasks", exact: true })).toBeEnabled();
    const removed = await page.request.post("/api/organizations/members/remove", { headers: { Origin: appOrigin }, data: { membershipId: membership.id } });
    expect(removed.ok(), await removed.text()).toBeTruthy();
    const revoked = await employeePage.request.get("/api/tasks");
    expect(revoked.status()).toBe(409);
    expect(await revoked.json()).toMatchObject({ code: "organization-required" });
    const [refresh] = await Promise.all([
      employeePage.waitForResponse((response) => response.url().endsWith("/api/tasks") && response.status() === 409),
      employeePage.clock.fastForward(31_000),
    ]);
    // The app immediately navigates after this response; Chromium may release
    // its body during navigation. The separate API request above checks its code.
    expect(refresh.status()).toBe(409);
    await expect(employeePage).toHaveURL(/\/onboarding$/);
    await expect(employeePage.getByRole("region", { name: "Task summary" })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("failed task reads and writes never appear as saved tasks or restore sample data", async ({ page }) => {
  const owner = await loginAs(page);
  const fault = async (code: string | null, operation: string) => {
    const response = await page.request.post(`${authFixtureOrigin}/__test/task-error`, { data: { userId: owner.id, code, operation } });
    expect(response.ok()).toBeTruthy();
  };
  await fault("08006", "write");
  const dialog = await createThroughForm(page, "Task that failed to save");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText(/try again|unavailable|save/i);
  expect((await savedTasks(page.request)).tasks).toEqual([]);
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await fault(null, "all");
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "GET") await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Tasks are temporarily unavailable.", code: "unavailable" }) });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Refresh tasks", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /couldn’t refresh your tasks/i })).toBeVisible();
  await expect(page.getByText("Complete vehicle safety check", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Task that failed to save", { exact: true })).toHaveCount(0);
  await page.unroute("**/api/tasks");
  await page.getByRole("button", { name: "Refresh tasks", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show tasks assigned: 0", exact: true })).toBeVisible();
});

test("missing task setup leaves the organization intact and offers a retry", async ({ page }) => {
  const owner = await loginAs(page);
  const response = await page.request.post(`${authFixtureOrigin}/__test/task-error`, { data: { userId: owner.id, code: "PGRST205", operation: "read" } });
  expect(response.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole("heading", { name: "One task setup step remains.", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Task summary" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create workspace", exact: true })).toHaveCount(0);
  const snapshot = await page.request.get("/api/tasks");
  expect(snapshot.status()).toBe(503);
  expect(await snapshot.json()).toMatchObject({ code: "setup-required" });
  await page.request.post(`${authFixtureOrigin}/__test/task-error`, { data: { userId: owner.id, code: null } });
  await page.reload();
  await expect(page.getByRole("button", { name: "Show tasks assigned: 0", exact: true })).toBeVisible();
});

test("task loading follows every page even when the database limits response rows", async ({ page }) => {
  const owner = await loginAs(page);
  const organization = await seedOrganization(page.request, { ownerId: owner.id });
  const seeded = [];
  for (let index = 0; index < 5; index += 1) {
    seeded.push(await seedTask(page.request, { organizationId: organization.id, createdBy: owner.id, title: `Paginated check ${index + 1}` }));
  }
  const capped = await page.request.post(`${authFixtureOrigin}/__test/task-page-limit`, { data: { userId: owner.id, limit: 2 } });
  expect(capped.ok()).toBeTruthy();
  const snapshot = await savedTasks(page.request);
  expect(snapshot.tasks.map((task) => task.id).sort()).toEqual(seeded.map((task) => task.id).sort());
  await page.reload();
  await expect(page.getByRole("button", { name: "Show tasks assigned: 5", exact: true })).toBeVisible();
});

test("completing recurring tasks creates one future occurrence even when completion is retried", async ({ page }) => {
  const owner = await loginAs(page);
  const organization = await seedOrganization(page.request, { ownerId: owner.id });
  const recurring = await seedTask(page.request, {
    organizationId: organization.id, createdBy: owner.id, title: "Daily recurring equipment check",
    frequency: "daily", timeZone: "UTC", dueAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  });
  for (let retry = 0; retry < 2; retry += 1) {
    const response = await taskMutation(page.request, "/complete", { taskId: recurring.id });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  const snapshot = await savedTasks(page.request);
  expect(snapshot.tasks).toHaveLength(2);
  expect(snapshot.tasks.find((task) => task.id === recurring.id)?.completedBy).toBe(owner.id);
  const next = snapshot.tasks.find((task) => task.parentTaskId === recurring.id);
  expect(next).toMatchObject({ title: recurring.title, frequency: "daily", completedAt: null });
  expect(new Date(next!.dueAt).getTime()).toBeGreaterThan(Date.now());
  for (const path of ["/update", "/delete"]) {
    const data = path === "/update" ? { ...taskInput({ title: "Edit completed history" }), taskId: recurring.id } : { taskId: recurring.id };
    expect((await taskMutation(page.request, path, data)).status()).toBe(409);
  }
  await page.reload();
  await expect(page.getByRole("button", { name: "Show tasks assigned: 2", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show completed: 1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show pending: 1", exact: true })).toBeVisible();
});

test("populated shared tasks and task controls fit desktop and mobile screens", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mkdir("artifacts", { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const owner = await loginAs(page);
  const organization = await seedOrganization(page.request, { ownerId: owner.id });
  const employee = await seedUser(page.request, { name: "Jordan Taylor" });
  const membership = await seedMembership(page.request, { organizationId: organization.id, userId: employee.id, role: "employee" });
  const dueAt = new Date(Date.now() + 86_400_000).toISOString();
  for (const details of [
    { title: "Complete the evening facility check", category: "Safety", assigneeId: membership.id, frequency: "daily", dueAt },
    { title: "Review shift handoff documentation", category: "Documentation", dueAt },
    { title: "Restock shared supply stations", category: "Operations", assigneeId: membership.id, dueAt },
    { title: "Inspect emergency equipment", category: "Maintenance", dueAt: new Date(Date.now() - 3_600_000).toISOString() },
    { title: "Prepare this week’s team briefing", category: "Team", frequency: "weekly", dueAt },
    { title: "Finish the opening checklist", category: "Operations", completedAt: new Date().toISOString(), completedBy: owner.id, dueAt },
  ] as const) {
    await seedTask(page.request, { organizationId: organization.id, createdBy: owner.id, description: "Check shared areas and record any follow-up work for the incoming team.", ...details });
  }
  await page.reload();
  await expect(page.getByRole("button", { name: "Show tasks assigned: 6", exact: true })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
    expect(dimensions.page, `No page overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    await page.screenshot({ path: `artifacts/tasks-${width === 390 ? "mobile" : "desktop"}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  const form = page.getByRole("dialog");
  await expect(form.getByLabel("Due date and time", { exact: true })).toBeVisible();
  await form.getByRole("button", { name: "Create task", exact: true }).scrollIntoViewIfNeeded();
  await expect(form.getByRole("button", { name: "Create task", exact: true })).toBeInViewport();
  const formDimensions = await form.evaluate((element) => ({ width: element.getBoundingClientRect().width, viewport: innerWidth, contentWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(formDimensions.width).toBeLessThanOrEqual(formDimensions.viewport);
  expect(formDimensions.contentWidth).toBeLessThanOrEqual(formDimensions.clientWidth);
  await form.evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: "artifacts/task-form-mobile.png", fullPage: true });
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("row").filter({ hasText: "Complete the evening facility check" }).getByText("Complete the evening facility check", { exact: true }).click();
  const details = page.getByRole("dialog");
  await expect(details.getByRole("button", { name: "Edit task", exact: true })).toBeVisible();
  await expect(details.getByRole("button", { name: "Delete task", exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/task-details-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
