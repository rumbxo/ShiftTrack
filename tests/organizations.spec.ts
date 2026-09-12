import { mkdir } from "node:fs/promises";
import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  appOrigin,
  authFixtureOrigin,
  createWorkspace,
  loginAs,
  seedMembership,
  seedOrganization,
  seedUser,
  uniqueEmail,
} from "./support/auth";

async function mutate(request: APIRequestContext, path: string, data: Record<string, unknown>) {
  return request.post(`/api/organizations${path}`, { headers: { Origin: appOrigin }, data });
}

test("new accounts create one workspace and see its saved identity after reload", async ({ page }) => {
  await loginAs(page, { name: "Riley Morgan", withoutOrganization: true });
  await expect(page.getByRole("heading", { name: "Create your workspace.", exact: true })).toBeVisible();
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/onboarding$/);

  const invalid = await mutate(page.request, "", { name: " " });
  expect(invalid.status()).toBe(400);
  await createWorkspace(page, "Maple House Team");
  await expect(page.getByText("Maple House Team", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Maple House Team", { exact: true })).toBeVisible();
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/dashboard$/);

  const duplicate = await mutate(page.request, "", { name: "A second workspace" });
  expect(duplicate.status()).toBe(200);
  const response = await page.request.get("/api/organizations/context");
  expect(await response.json()).toMatchObject({ organization: { name: "Maple House Team", role: "owner" } });
});

test("owners rename workspaces and manage confirmed existing accounts", async ({ page }) => {
  const owner = await loginAs(page);
  const teammate = await seedUser(page.request, { name: "Casey Taylor" });
  await page.goto("/workspace");
  await expect(page.getByRole("heading", { name: "Workspace settings", exact: true })).toBeVisible();
  await page.getByLabel("Organization name", { exact: true }).fill("Maple House Team");
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Save workspace", exact: true }).click(),
  ]);
  await page.reload();
  await expect(page.getByLabel("Organization name", { exact: true })).toHaveValue("Maple House Team");

  await page.getByLabel("Teammate email", { exact: true }).fill(teammate.email);
  await page.getByRole("combobox", { name: "Role", exact: true }).selectOption("employee");
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  const row = page.getByRole("listitem").filter({ hasText: teammate.email });
  await expect(row).toBeVisible();
  await row.getByRole("combobox").selectOption("manager");
  await Promise.all([
    page.waitForEvent("load"),
    row.getByRole("button", { name: `Save role for ${teammate.email}`, exact: true }).click(),
  ]);
  await page.reload();
  await expect(row.getByRole("combobox")).toHaveValue("manager");
  const ownerRow = page.getByRole("listitem").filter({ hasText: owner.email });
  await expect(ownerRow).toContainText(/owner/i);
  await expect(ownerRow.getByRole("button", { name: `Remove ${owner.email}`, exact: true })).toHaveCount(0);

  await row.getByRole("button", { name: `Remove ${teammate.email}`, exact: true }).click();
  const confirmation = page.getByRole("dialog");
  await expect(confirmation).toContainText("Casey Taylor");
  await confirmation.getByRole("button", { name: "Remove member", exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(row).toHaveCount(0);
  await page.goto("/dashboard");
  await expect(page.getByText("Maple House Team", { exact: true })).toBeVisible();
});

test("member input errors do not change membership or remove the owner", async ({ page }) => {
  const owner = await loginAs(page);
  const existing = await seedUser(page.request, { name: "Other Owner" });
  await seedOrganization(page.request, { ownerId: existing.id, name: "Another team" });
  const unavailable = await mutate(page.request, "/members", { email: uniqueEmail("missing"), role: "employee" });
  expect(unavailable.status()).toBe(409);
  const alreadyJoined = await mutate(page.request, "/members", { email: existing.email, role: "employee" });
  expect(alreadyJoined.status()).toBe(409);
  const privilegedRole = await mutate(page.request, "/members", { email: existing.email, role: "owner" });
  expect(privilegedRole.status()).toBe(400);

  const context = await (await page.request.get("/api/organizations/context")).json();
  expect(context.userId).toBe(owner.id);
  const membershipId = context.organization.membershipId;
  const removeOwner = await mutate(page.request, "/members/remove", { membershipId });
  expect(removeOwner.status()).toBe(403);
  const demoteOwner = await mutate(page.request, "/members/role", { membershipId, role: "employee" });
  expect(demoteOwner.status()).toBe(403);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
});

for (const role of ["manager", "employee"] as const) {
  test(`${role}s can read the member list but cannot change the workspace through the UI or API`, async ({ page }) => {
    const owner = await seedUser(page.request, { name: "Workspace Owner" });
    const organization = await seedOrganization(page.request, { ownerId: owner.id, name: "Shared Maple House" });
    const account = await seedUser(page.request, { name: "Casey Taylor" });
    const membership = await seedMembership(page.request, { organizationId: organization.id, userId: account.id, role });
    await loginAs(page, account);
    await page.goto("/workspace");
    await expect(page.getByRole("heading", { name: /^Members/ })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: owner.email })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: account.email })).toContainText(new RegExp(role, "i"));
    await expect(page.getByRole("button", { name: "Save workspace", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add member", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Save role/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);

    for (const [path, data] of [
      ["/rename", { name: "Unauthorized rename" }],
      ["/members", { email: uniqueEmail(), role: "employee" }],
      ["/members/role", { membershipId: membership.id, role: "manager" }],
      ["/members/remove", { membershipId: membership.id }],
    ] as const) {
      const response = await mutate(page.request, path, data);
      expect(response.status(), path).toBe(403);
    }
    await page.reload();
    await expect(page.getByText("Shared Maple House", { exact: true })).toBeVisible();
  });
}

test("organization routes reject anonymous and cross-origin mutations", async ({ page, request }) => {
  for (const destination of ["/workspace", "/onboarding"]) {
    await page.goto(destination);
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
  }
  const anonymous = await mutate(request, "", { name: "Anonymous workspace" });
  expect(anonymous.status()).toBe(401);
  await loginAs(page);
  for (const [path, data] of [
    ["", { name: "Cross-origin workspace" }],
    ["/rename", { name: "Unauthorized rename" }],
    ["/members", { email: uniqueEmail(), role: "employee" }],
    ["/members/role", { membershipId: "58c2b054-79b2-4d50-a136-56a911d08490", role: "manager" }],
    ["/members/remove", { membershipId: "58c2b054-79b2-4d50-a136-56a911d08490" }],
  ] as const) {
    const response = await page.request.post(`/api/organizations${path}`, {
      headers: { Origin: "https://example.com" }, data,
    });
    expect(response.status(), path).toBe(403);
  }
});

test("removing an active member checks access when their dashboard regains focus", async ({ page, browser }) => {
  const owner = await loginAs(page);
  const organization = await seedOrganization(page.request, { ownerId: owner.id });
  const account = await seedUser(page.request, { name: "Casey Taylor" });
  const membership = await seedMembership(page.request, { organizationId: organization.id, userId: account.id, role: "employee" });
  const memberContext = await browser.newContext({ baseURL: appOrigin });
  try {
    const memberPage = await memberContext.newPage();
    await loginAs(memberPage, account);
    const removed = await mutate(page.request, "/members/remove", { membershipId: membership.id });
    expect(removed.ok(), await removed.text()).toBeTruthy();
    await memberPage.bringToFront();
    await memberPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(memberPage).toHaveURL(/\/onboarding$/);
    await memberPage.goto("/workspace");
    await expect(memberPage).toHaveURL(/\/onboarding$/);
  } finally {
    await memberContext.close();
  }
});

test("a forged membership ID cannot change a different workspace", async ({ page }) => {
  await loginAs(page);
  const otherOwner = await seedUser(page.request);
  const otherOrganization = await seedOrganization(page.request, { ownerId: otherOwner.id });
  const otherEmployee = await seedUser(page.request);
  const otherMembership = await seedMembership(page.request, { organizationId: otherOrganization.id, userId: otherEmployee.id, role: "employee" });
  for (const [path, data] of [
    ["/members/role", { membershipId: otherMembership.id, role: "manager" }],
    ["/members/remove", { membershipId: otherMembership.id }],
  ] as const) {
    const response = await mutate(page.request, path, data);
    expect(response.status()).toBe(403);
  }
  const unchanged = await seedMembership(page.request, { organizationId: otherOrganization.id, userId: otherEmployee.id, role: "employee" });
  expect(unchanged).toMatchObject({ id: otherMembership.id, role: "employee" });
});

for (const [scenario, code, heading, apiCode] of [
  ["missing database setup", "PGRST205", "One setup step remains.", "setup-required"],
  ["a database outage", "08006", "We couldn’t load your workspace.", "unavailable"],
] as const) {
  test(`${scenario} keeps existing users out of workspace creation`, async ({ page }) => {
    const identity = await loginAs(page);
    const fault = await page.request.post(`${authFixtureOrigin}/__test/database-error`, { data: { userId: identity.id, code } });
    expect(fault.ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create workspace", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Task summary" })).toHaveCount(0);
    const response = await mutate(page.request, "", { name: "Accidental replacement" });
    expect(response.status()).toBe(503);
    expect(await response.json()).toMatchObject({ code: apiCode });
    await page.request.post(`${authFixtureOrigin}/__test/database-error`, { data: { userId: identity.id, code: null } });
    await page.reload();
    await expect(page.getByText("Oak Street Group Home", { exact: true })).toBeVisible();
  });
}

test("workspace creation and member controls fit desktop and mobile screens", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mkdir("artifacts", { recursive: true });
  const owner = await loginAs(page, { withoutOrganization: true });
  await page.screenshot({ path: "artifacts/onboarding-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/onboarding-mobile.png", fullPage: true });
  await createWorkspace(page);
  const organization = await seedOrganization(page.request, { ownerId: owner.id });
  const account = await seedUser(page.request, { name: "Casey Taylor" });
  await seedMembership(page.request, { organizationId: organization.id, userId: account.id, role: "manager" });
  await page.goto("/workspace");
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
    expect(dimensions.page, `No horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    await expect(page.getByRole("button", { name: "Add member", exact: true })).toBeVisible();
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: `artifacts/workspace-${width === 390 ? "mobile" : "desktop"}.png`, fullPage: true });
    }
  }
  expect(errors).toEqual([]);
});
