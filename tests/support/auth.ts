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
  options: { email?: string; name?: string; password?: string } = {},
) {
  const identity = await seedUser(page.request, options);
  const response = await page.request.post("/api/auth/login", {
    headers: { Origin: appOrigin },
    data: { email: identity.email, password: identity.password },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  return identity;
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
