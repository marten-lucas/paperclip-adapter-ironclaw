import { expect, test } from "@playwright/test";

function requireEnv(name: string): string | null {
  const value = process.env[name];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

test.beforeEach(async ({ context, baseURL }, testInfo) => {
  const token = requireEnv("PAPERCLIP_SESSION_TOKEN");
  if (!token) {
    testInfo.skip(true, "Set PAPERCLIP_SESSION_TOKEN to run Playwright tests");
    return;
  }

  if (!baseURL) {
    testInfo.skip(true, "Missing baseURL");
    return;
  }

  const base = new URL(baseURL);
  await context.addCookies([
    {
      name: "paperclip-default.session_token",
      value: token,
      domain: base.hostname,
      path: "/",
      httpOnly: true,
      secure: base.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
});

test("ironclaw adapter schema endpoint returns required fields", async ({ page, baseURL }) => {
  const response = await page.request.get(`${baseURL}/api/adapters/ironclaw_http/config-schema`);
  expect(response.ok(), await response.text()).toBeTruthy();

  const body = (await response.json()) as {
    fields?: Array<{ key?: string }>;
  };

  const keys = new Set((body.fields ?? []).map((f) => f.key));
  expect(keys.has("url")).toBeTruthy();
  expect(keys.has("authToken")).toBeTruthy();
  expect(keys.has("timeout")).toBeTruthy();
});

test("agent configuration page shows ironclaw config fields", async ({ page }) => {
  const path = process.env.PAPERCLIP_AGENT_CONFIG_PATH || "/AHOA/agents/ceo/configuration";

  await page.goto(path, { waitUntil: "domcontentloaded" });

  // Guard against silent auth redirects.
  await expect(page).toHaveURL(/\/AHOA\/agents\/.*\/configuration/);

  // Open adapter type selector and pick Ironclaw.
  await page.locator("button").filter({ hasText: /(OpenCode|Ironclaw)/i }).first().click();
  await page.getByText(/Ironclaw Http/i).first().click();

  await expect(page.getByText("Ironclaw URL", { exact: false })).toBeVisible();
  await expect(page.getByText("API Token", { exact: false })).toBeVisible();
});
