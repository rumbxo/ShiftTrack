import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  appOrigin,
  createWorkspace,
  fixtureEmailLink,
  fixturePassword,
  loginAs,
  seedUser,
  seedOrganization,
  seedTask,
  uniqueEmail,
} from "./support/auth";

async function submitLogin(page: Page, email: string, password = fixturePassword) {
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

async function registerViaApi(request: APIRequestContext, name = "Riley Morgan") {
  const email = uniqueEmail("register");
  const response = await request.post("/api/auth/register", {
    headers: { Origin: appOrigin },
    data: { name, email, password: fixturePassword },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  expect(await response.json()).toMatchObject({ requiresEmailConfirmation: true });
  return { email, name };
}

test("signed-out users cannot open the dashboard or password update page", async ({ page, request }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Task summary" })).toHaveCount(0);

  await page.goto("/reset-password");
  await expect(page).toHaveURL(/\/forgot-password\?error=invalid-link$/);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/expired|invalid/i);

  const response = await request.post("/api/auth/reset-password", {
    headers: { Origin: appOrigin },
    data: { password: fixturePassword, confirmPassword: fixturePassword },
  });
  expect(response.status()).toBe(401);
});

test("login reports invalid credentials, preserves verified identity after reload, and logout protects revisits", async ({ page }) => {
  const identity = await seedUser(page.request, { name: "Riley Morgan" });
  await seedOrganization(page.request, { ownerId: identity.id });
  await page.goto("/login");
  await submitLogin(page, identity.email, "Wrong-password-123!");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/email or password is incorrect/i);
  await expect(page).toHaveURL(/\/login$/);

  await submitLogin(page, identity.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Welcome back, Riley", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome back, Riley", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("region", { name: "Task summary" })).toHaveCount(0);
});

test("registration checks matching passwords and completes an email confirmation through PKCE", async ({ page }) => {
  const email = uniqueEmail("riley");
  await page.goto("/register");
  await page.getByLabel("Full name", { exact: true }).fill("Riley Morgan");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(fixturePassword);
  await page.getByLabel("Confirm password", { exact: true }).fill("Different-password-123!");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/passwords.*match/i);
  await page.getByLabel("Confirm password", { exact: true }).fill(fixturePassword);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox.", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/confirmation link/i);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);

  const link = await fixtureEmailLink(page.request, { email, type: "signup" });
  await page.goto(link.url);
  await expect(page).toHaveURL(/\/onboarding$/);
  await createWorkspace(page);
  await expect(page.getByRole("heading", { name: "Welcome back, Riley", exact: true })).toBeVisible();
});

test("token-hash confirmation works in a fresh browser and rejects replayed links", async ({ browser, request }) => {
  const { email } = await registerViaApi(request);
  const link = await fixtureEmailLink(request, { email, type: "signup" });
  const context = await browser.newContext({ baseURL: appOrigin });
  const page = await context.newPage();
  try {
    await page.goto(link.confirmationUrl);
    await expect(page).toHaveURL(/\/onboarding$/);
    await createWorkspace(page);
    await expect(page.getByRole("heading", { name: "Welcome back, Riley", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto(link.confirmationUrl);
    await expect(page).toHaveURL(/\/login\?error=invalid-link$/);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(/expired|invalid/i);
  } finally {
    await context.close();
  }
});

test("password recovery hides account existence and updates the password using the emailed link", async ({ page }) => {
  const identity = await seedUser(page.request, { name: "Casey Taylor" });
  await seedOrganization(page.request, { ownerId: identity.id });
  const responses = [];
  for (const email of [identity.email, uniqueEmail("unknown")]) {
    const response = await page.request.post("/api/auth/forgot-password", {
      headers: { Origin: appOrigin }, data: { email },
    });
    expect(response.ok()).toBeTruthy();
    responses.push(await response.json());
  }
  expect(responses[0]).toEqual(responses[1]);

  await page.goto("/forgot-password");
  await page.getByLabel("Email address", { exact: true }).fill(identity.email);
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox.", exact: true })).toBeVisible();
  const link = await fixtureEmailLink(page.request, { email: identity.email, type: "recovery" });
  await page.goto(link.url);
  await expect(page).toHaveURL(/\/reset-password$/);

  const newPassword = "A-new-ShiftTrack-password-123!";
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm password", { exact: true }).fill(fixturePassword);
  await page.getByRole("button", { name: "Save new password", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/passwords.*match/i);
  await page.getByLabel("Confirm password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Save new password", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?message=password-updated$/);
  await expect(page.getByRole("status")).toContainText(/password has been updated/i);
  await submitLogin(page, identity.email);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/incorrect/i);
  await submitLogin(page, identity.email, newPassword);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Welcome back, Casey", exact: true })).toBeVisible();
});

test("invalid recovery links show a usable error and callback destinations stay on this app", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=expired-fixture&type=recovery");
  await expect(page).toHaveURL(/\/forgot-password\?error=invalid-link$/);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/expired|invalid/i);
  await page.goto("/auth/callback?code=invalid-fixture");
  await expect(page).toHaveURL(/\/login\?error=invalid-link$/);

  const identity = await registerViaApi(page.request);
  const link = await fixtureEmailLink(page.request, { email: identity.email, type: "signup" });
  const callback = new URL(link.url);
  callback.searchParams.set("next", "https://example.com/outside-app");
  await page.goto(callback.toString());
  await expect(page).toHaveURL(`${appOrigin}/onboarding`);
});

test("cross-origin authentication mutations are rejected and server validation cannot be skipped", async ({ page, request }) => {
  const identity = await loginAs(page);
  for (const endpoint of ["login", "register", "forgot-password", "reset-password", "logout"]) {
    const response = await page.request.post(`/api/auth/${endpoint}`, {
      headers: { Origin: "https://example.com" },
      data: { name: identity.name, email: identity.email, password: fixturePassword },
    });
    expect(response.status(), endpoint).toBe(403);
  }
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);

  const response = await request.post("/api/auth/register", {
    headers: { Origin: appOrigin },
    data: { name: "Riley Morgan", email: uniqueEmail(), password: "short" },
  });
  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({ error: expect.stringMatching(/8/) });
});

test("switching accounts in one browser loads each account's saved workspace tasks", async ({ page }) => {
  const first = await loginAs(page, { name: "Riley Morgan" });
  const task = "Complete vehicle safety check";
  const organization = await seedOrganization(page.request, { ownerId: first.id });
  await seedTask(page.request, { organizationId: organization.id, createdBy: first.id, title: task });
  await page.reload();
  await page.getByRole("button", { name: `Complete ${task}`, exact: true }).click();
  await expect(page.getByRole("button", { name: "Show completed: 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);

  await loginAs(page, { name: "Casey Taylor" });
  await expect(page.getByRole("heading", { name: "Welcome back, Casey", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show tasks assigned: 0", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `Complete ${task}`, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);

  await submitLogin(page, first.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Welcome back, Riley", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show completed: 1", exact: true })).toBeVisible();
});

test("confirming another account in a second tab replaces the original tab's workspace tasks", async ({ page, context }) => {
  const first = await loginAs(page, { name: "Riley Morgan" });
  const task = "Complete vehicle safety check";
  const organization = await seedOrganization(page.request, { ownerId: first.id });
  await seedTask(page.request, { organizationId: organization.id, createdBy: first.id, title: task });
  await page.reload();
  await page.getByRole("button", { name: `Complete ${task}`, exact: true }).click();
  await expect(page.getByRole("button", { name: "Show completed: 1", exact: true })).toBeVisible();

  const second = await registerViaApi(page.request, "Casey Taylor");
  const link = await fixtureEmailLink(page.request, { email: second.email, type: "signup" });
  await expect(page.getByRole("heading", { name: "Welcome back, Riley", exact: true })).toBeVisible();

  const callbackPage = await context.newPage();
  try {
    // Email callbacks replace cookies without the login form's storage event.
    await callbackPage.goto(link.confirmationUrl);
    await expect(callbackPage).toHaveURL(/\/onboarding$/);
    await expect(page).toHaveURL(/\/onboarding$/);
    await createWorkspace(callbackPage);
    await expect(callbackPage.getByRole("heading", { name: "Welcome back, Casey", exact: true })).toBeVisible();

    // The original tab must update automatically, without a manual reload.
    await expect(page.getByRole("heading", { name: "Welcome back, Casey", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Welcome back, Riley", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Show tasks assigned: 0", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `Complete ${task}`, exact: true })).toHaveCount(0);
    await expect(callbackPage.getByRole("button", { name: "Show tasks assigned: 0", exact: true })).toBeVisible();
  } finally {
    await callbackPage.close();
  }
});

test("login cannot submit credentials before JavaScript initializes", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: appOrigin, javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("/login");
    await expect(page.getByLabel("Email address", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("Password", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeDisabled();
    // A native form submission must never put credentials in the URL.
    await expect(page.getByRole("main").locator("form")).toHaveAttribute("method", /^post$/i);
  } finally {
    await context.close();
  }
});
