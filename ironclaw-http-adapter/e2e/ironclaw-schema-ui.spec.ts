import { expect, test, type APIResponse, type TestInfo } from "@playwright/test";

function requireEnv(name: string): string | null {
  const value = process.env[name];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asSecretRef(secretId: string): string {
  return JSON.stringify({ type: "secret_ref", secretId, version: "latest" });
}

async function readJsonOrSkip(
  response: APIResponse,
  testInfo: TestInfo,
  contextMessage: string,
): Promise<any> {
  const status = response.status();
  const headers = response.headers();
  const contentType = headers["content-type"] || "";
  const location = headers.location || "";
  const bodyText = await response.text();

  if (status >= 300 && status < 400 && /\/yunohost\/sso/i.test(location)) {
    testInfo.skip(true, `${contextMessage}: redirected to SSO. Refresh PAPERCLIP_SESSION_TOKEN.`);
  }

  if (!response.ok()) {
    throw new Error(`${contextMessage}: HTTP ${status} ${bodyText.slice(0, 500)}`);
  }

  if (!/application\/json/i.test(contentType)) {
    testInfo.skip(
      true,
      `${contextMessage}: expected JSON but received '${contentType || "unknown"}'. First bytes: ${bodyText.slice(0, 120)}`,
    );
  }

  return JSON.parse(bodyText);
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

test("ironclaw adapter schema endpoint returns required fields", async ({ page, baseURL }, testInfo) => {
  const response = await page.request.get(`${baseURL}/api/adapters/ironclaw_http/config-schema`);
  const body = (await readJsonOrSkip(response, testInfo, "config-schema request")) as {
    fields?: Array<{ key?: string }>;
  };

  const keys = new Set((body.fields ?? []).map((f) => f.key));
  expect(keys.has("url")).toBeTruthy();
  expect(keys.has("authToken")).toBeTruthy();
  expect(keys.has("timeout")).toBeTruthy();
});

test("agent configuration page shows ironclaw config fields", async ({ page }, testInfo) => {
  const adapterSettingsPath = process.env.PAPERCLIP_ADAPTER_SETTINGS_PATH || "/AHOA/company/settings/instance/adapters";
  const path = process.env.PAPERCLIP_AGENT_CONFIG_PATH || "/AHOA/agents/ceo/configuration";
  const expectedVersion = requireEnv("PAPERCLIP_ADAPTER_EXPECTED_VERSION");

  // Step 1: verify adapter registration (and expected version when provided).
  const adaptersResponse = await page.request.get("/api/adapters");
  const adapters = (await readJsonOrSkip(adaptersResponse, testInfo, "adapters registry request")) as Array<{
    type?: string;
    version?: string;
  }>;

  const ironclawAdapter = adapters.find((adapter) => adapter.type === "ironclaw_http");
  expect(ironclawAdapter, "ironclaw_http adapter must be installed").toBeTruthy();
  if (expectedVersion) {
    expect(ironclawAdapter?.version, "installed adapter version mismatch").toBe(expectedVersion);
  }

  // Open adapter settings page as a UI-level confirmation that settings are reachable.
  await page.goto(adapterSettingsPath, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/settings\/instance\/adapters/);
  await expect(page.getByText(/Ironclaw Http/i).first()).toBeVisible();

  await page.goto(path, { waitUntil: "domcontentloaded" });

  // Guard against silent auth redirects.
  await expect(page).toHaveURL(/\/AHOA\/agents\/.*\/configuration/);

  // Open adapter type selector and pick Ironclaw.
  await page.locator("button").filter({ hasText: /(OpenCode|Ironclaw)/i }).first().click();
  await page.getByText(/Ironclaw Http/i).first().click();

  const urlFieldLabel = page.getByText("Ironclaw URL", { exact: false });
  const tokenFieldLabel = page.getByText("API Token", { exact: false });

  await expect(urlFieldLabel).toBeVisible();
  await expect(tokenFieldLabel).toBeVisible();

  // Step 2: once fields are visible, configure them to use Paperclip secrets.
  await page.getByLabel(/Ironclaw URL/i).fill(asSecretRef("ironclaw_url"));
  await page.getByLabel(/API Token/i).fill(asSecretRef("ironclaw_token"));

  await expect(page.getByLabel(/Ironclaw URL/i)).toHaveValue(/ironclaw_url/);
  await expect(page.getByLabel(/API Token/i)).toHaveValue(/ironclaw_token/);
});
