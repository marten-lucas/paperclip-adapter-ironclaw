import { expect, test, type APIResponse } from "@playwright/test";

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
  contextMessage: string,
): Promise<any> {
  const status = response.status();
  const headers = response.headers();
  const contentType = headers["content-type"] || "";
  const location = headers.location || "";
  const bodyText = await response.text();

  if (status >= 300 && status < 400 && /\/yunohost\/sso/i.test(location)) {
    throw new Error(`${contextMessage}: redirected to SSO at '${location}'. Refresh PAPERCLIP_SESSION_TOKEN.`);
  }

  if (!response.ok()) {
    throw new Error(`${contextMessage}: HTTP ${status} ${bodyText.slice(0, 500)}`);
  }

  if (!/application\/json/i.test(contentType)) {
    throw new Error(
      `${contextMessage}: expected JSON but received '${contentType || "unknown"}'. First bytes: ${bodyText.slice(0, 120)}`,
    );
  }

  return JSON.parse(bodyText);
}

test.beforeEach(async ({ context, page, baseURL }) => {
  const token = requireEnv("PAPERCLIP_SESSION_TOKEN");
  const yunoHostToken = requireEnv("YUNOHOST_SESSION_TOKEN");
  const loginUser = requireEnv("PAPERCLIP_LOGIN_USERNAME");
  const loginPassword = requireEnv("PAPERCLIP_LOGIN_PASSWORD");
  expect(token, "Set PAPERCLIP_SESSION_TOKEN to run Playwright tests").toBeTruthy();
  expect(baseURL, "Missing PAPERCLIP_BASE_URL").toBeTruthy();

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

  if (yunoHostToken) {
    const baseHost = base.hostname;
    const ssoDomain = base.hostname.replace(/^paperclip\./, "");
    await context.addCookies([
      {
        name: "yunohost.portal",
        value: yunoHostToken,
        domain: baseHost,
        path: "/",
        httpOnly: true,
        secure: base.protocol === "https:",
        sameSite: "Lax",
      },
      {
        name: "yunohost.portal",
        value: yunoHostToken,
        domain: ssoDomain,
        path: "/",
        httpOnly: true,
        secure: base.protocol === "https:",
        sameSite: "Lax",
      },
    ]);
  }

  // Assert the configured base URL is reachable and loaded in the browser context.
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });

  // In headed runs, allow a brief interactive login window if SSO redirect is shown.
  if (/\/yunohost\/sso\//i.test(page.url())) {
    // If credentials are provided, perform login automatically.
    if (loginUser && loginPassword) {
      await page.getByPlaceholder(/username/i).fill(loginUser);
      await page.getByPlaceholder(/password/i).fill(loginPassword);
      await page.getByRole("button", { name: /log in/i }).click();
    }

    await expect
      .poll(() => page.url(), {
        timeout: 90_000,
        message:
          "Complete SSO login in the opened browser window or set PAPERCLIP_LOGIN_USERNAME/PAPERCLIP_LOGIN_PASSWORD.",
      })
      .not.toContain("/yunohost/sso/");
  }

  expect(page.url(), "PAPERCLIP_BASE_URL was not opened in browser").toContain(base.origin);

  // Assert login worked by requiring authenticated JSON access to adapters endpoint.
  const loginProbe = await page.request.get("/api/adapters");
  await readJsonOrSkip(loginProbe, "login probe /api/adapters");
});

test("ironclaw adapter end-to-end setup test succeeds", async ({ page }) => {
  const adapterSettingsPath = process.env.PAPERCLIP_ADAPTER_SETTINGS_PATH || "/AHOA/company/settings/instance/adapters";
  const adapterSecretsPath = process.env.PAPERCLIP_ADAPTER_SECRETS_PATH || "/AHOA/company/settings/secrets";
  const path = process.env.PAPERCLIP_AGENT_CONFIG_PATH || "/AHOA/agents/ceo/configuration";
  const expectedVersion = requireEnv("PAPERCLIP_ADAPTER_EXPECTED_VERSION");

  // Step 1: verify adapter registration (and expected version when provided).
  const adaptersResponse = await page.request.get("/api/adapters");
  const adapters = (await readJsonOrSkip(adaptersResponse, "adapters registry request")) as Array<{
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
  await expect(page.getByText(/ironclaw_http/i).first()).toBeVisible();

  // Step 2: verify required secrets are present.
  await page.goto(adapterSecretsPath, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/settings\/secrets/);
  await expect(page.getByText(/ironclaw_url/i).first()).toBeVisible();
  await expect(page.getByText(/ironclaw_token/i).first()).toBeVisible();

  // Step 3: navigate to CEO agent configuration.
  await page.goto(path, { waitUntil: "domcontentloaded" });

  // Guard against silent auth redirects.
  await expect(page).toHaveURL(/\/AHOA\/agents\/.*\/configuration/);

  // Open adapter type selector and pick Ironclaw.
  await page.locator("button").filter({ hasText: /(OpenCode|Ironclaw)/i }).first().click();
  await page.getByText(/Ironclaw Http/i).first().click();

  const urlInput = page
    .locator('input[name="url"], textarea[name="url"], input[placeholder*="url" i], input[aria-label*="url" i]')
    .first();
  const tokenInput = page
    .locator(
      'input[name="authToken"], textarea[name="authToken"], input[name="token"], input[placeholder*="token" i], input[aria-label*="token" i]',
    )
    .first();

  await expect(urlInput, "URL input field should be visible").toBeVisible();
  await expect(tokenInput, "Token input field should be visible").toBeVisible();

  // Step 4: once fields are visible, configure them to use Paperclip secrets.
  await urlInput.fill(asSecretRef("ironclaw_url"));
  await tokenInput.fill(asSecretRef("ironclaw_token"));

  await expect(urlInput).toHaveValue(/ironclaw_url/);
  await expect(tokenInput).toHaveValue(/ironclaw_token/);

  // Step 5: run adapter test and expect a success indication.
  const testButton = page.getByRole("button", { name: /^(test|test adapter|test connection)$/i }).first();
  await expect(testButton, "Adapter test button should be visible").toBeVisible();
  await testButton.click();

  const successSignal = page
    .getByText(/(test successful|connection successful|successfully connected|all checks passed|adapter test passed)/i)
    .first();
  await expect(successSignal, "Adapter test should succeed").toBeVisible({ timeout: 30_000 });
});
