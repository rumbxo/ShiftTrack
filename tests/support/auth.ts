import { createHash, randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const appOrigin = "http://127.0.0.1:3100";
export const authFixtureOrigin = "http://127.0.0.1:3101";
export const fixturePassword = "ShiftTrack-Test-123!";

export function fixtureUserId(email: string) {
  const hex = createHash("sha256").update(email.toLowerCase()).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function uniqueEmail(prefix = "ahmand") {
  return `${prefix}+${randomUUID()}@example.com`;
}

export async function seedUser(
  request: APIRequestContext,
  options: { email?: string; name?: string; password?: string; confirmed?: boolean } = {},
) {
  const identity = {
    email: options.email ?? uniqueEmail(),
    name: options.name ?? "Ahmand Edmonds",
    password: options.password ?? fixturePassword,
    confirmed: options.confirmed ?? true,
  };
  const response = await request.post(`${authFixtureOrigin}/__test/users`, { data: identity });
  expect(response.ok()).toBeTruthy();
  return { ...identity, id: fixtureUserId(identity.email) };
}

export async function loginAs(
  page: Page,
  options: { email?: string; name?: string; password?: string; organizationName?: string; withoutOrganization?: boolean } = {},
) {
  const identity = await seedUser(page.request, options);
  if (!options.withoutOrganization) {
    await seedOrganization(page.request, { ownerId: identity.id, name: options.organizationName });
  }
  const response = await page.request.post("/api/auth/login", {
    headers: { Origin: appOrigin },
    data: { email: identity.email, password: identity.password },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(options.withoutOrganization ? /\/onboarding$/ : /\/dashboard$/);
  return identity;
}

export async function seedOrganization(
  request: APIRequestContext,
  options: { ownerId: string; name?: string },
): Promise<{ id: string; name: string; created_at: string }> {
  const response = await request.post(`${authFixtureOrigin}/__test/organizations`, { data: options });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

export async function seedMembership(
  request: APIRequestContext,
  options: { organizationId: string; userId: string; role: "manager" | "employee" },
): Promise<{ id: string; organization_id: string; user_id: string; role: string }> {
  const response = await request.post(`${authFixtureOrigin}/__test/memberships`, { data: options });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

export type FixtureTaskInput = {
  title: string;
  description?: string;
  category?: "Safety" | "Operations" | "Documentation" | "Maintenance" | "Team";
  assigneeId?: string | null;
  dueAt?: string;
  frequency?: "once" | "daily" | "weekly" | "monthly";
  timeZone?: string;
};

export async function seedTask(
  request: APIRequestContext,
  options: FixtureTaskInput & { organizationId: string; createdBy: string; completedAt?: string; completedBy?: string },
): Promise<{ id: string; organization_id: string; title: string; assignee_id: string | null; due_at: string }> {
  const response = await request.post(`${authFixtureOrigin}/__test/tasks`, { data: options });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

export function taskInput(options: FixtureTaskInput) {
  return {
    description: "Check shared areas and secure the supply cupboard.",
    category: "Safety",
    assigneeId: null,
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    frequency: "once",
    timeZone: "UTC",
    ...options,
  };
}

export async function taskMutation(request: APIRequestContext, path: string, data: Record<string, unknown>) {
  return request.post(`/api/tasks${path}`, { headers: { Origin: appOrigin }, data });
}

export async function savedTasks(request: APIRequestContext) {
  const response = await request.get("/api/tasks");
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{
    tasks: Array<{ id: string; title: string; description: string; assigneeId: string | null; dueAt: string; frequency: string; completedAt: string | null; completedBy: string | null; parentTaskId: string | null }>;
    members: Array<{ id: string; userId: string; name: string; role: string }>;
  }>;
}

export async function createWorkspace(page: Page, name = "Oak Street Group Home") {
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Organization name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

export async function fixtureEmailLink(
  request: APIRequestContext,
  options: { email: string; type: "signup" | "recovery" },
): Promise<{ url: string; confirmationUrl: string; code: string; tokenHash: string }> {
  const query = new URLSearchParams(options);
  const response = await request.get(`${authFixtureOrigin}/__test/email-link?${query}`);
  expect(response.ok(), "The auth fixture should capture the requested email").toBeTruthy();
  return response.json();
}
