import { expect, test, type APIResponse } from "@playwright/test";

function requireEnv(name: string): string | null {
  const value = process.env[name];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalEnv(key: string): string {
  return (process.env[key] || "").trim();
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

async function assertModelsDiscoverable(page: import("@playwright/test").Page, baseUrl: string, token: string): Promise<string[]> {
  const endpoints: Array<{
    path: string;
    method: "GET" | "POST";
    body?: Record<string, unknown>;
  }> = [
    {
      path: "/api/llm/list_models",
      method: "POST",
      body: { adapter: "openai-compatible" },
    },
    {
      path: "/api/webchat/v2/llm/list-models",
      method: "POST",
      body: {},
    },
    {
      path: "/api/gateway/status",
      method: "GET",
    },
  ];

  const discovered = new Set<string>();
  const failingStatuses: Array<{ path: string; status: number }> = [];

  for (const endpoint of endpoints) {
    const requestUrl = `${baseUrl}${endpoint.path}`;
    const response = endpoint.method === "POST"
      ? await page.request.post(requestUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          data: endpoint.body ?? {},
        })
      : await page.request.get(requestUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

    if (!response.ok()) {
      failingStatuses.push({ path: endpoint.path, status: response.status() });
      continue;
    }

    const payload = await response.json() as Record<string, unknown>;
    const candidates: unknown[] = [
      payload.models,
      payload.model,
      payload.llm_model,
      (payload.data as Record<string, unknown> | undefined)?.models,
      (payload.data as Record<string, unknown> | undefined)?.model,
      (payload.data as Record<string, unknown> | undefined)?.llm_model,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        for (const item of candidate) {
          if (typeof item === "string" && item.trim().length > 0) {
            discovered.add(item.trim());
          }
        }
        continue;
      }

      if (typeof candidate === "string" && candidate.trim().length > 0) {
        discovered.add(candidate.trim());
        continue;
      }

      if (candidate && typeof candidate === "object") {
        for (const key of Object.keys(candidate as Record<string, unknown>)) {
          if (key.trim().length > 0) {
            discovered.add(key.trim());
          }
        }
      }
    }
  }

  const hadAuthFailure = failingStatuses.some((entry) => entry.status === 401 || entry.status === 403);
  if (hadAuthFailure) {
    throw new Error(
      `Ironclaw auth failed for '${baseUrl}'. Set a valid IRONCLAW_E2E_TOKEN (or IRONCLAW_API_KEY) accepted by this endpoint.`,
    );
  }

  expect(
    discovered.size,
    `No models discoverable on '${baseUrl}'. Configure Ironclaw models and verify CT300 shim routing (expected status 200 on /api/llm/list_models).`,
  ).toBeGreaterThan(0);

  return Array.from(discovered);
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

  // Step 2: verify required secrets are present.
  await page.goto(adapterSecretsPath, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/settings\/secrets/);
  await expect(page.getByText(/ironclaw_url/i).first()).toBeVisible();
  await expect(page.getByText(/ironclaw_token/i).first()).toBeVisible();

  // Step 3: navigate to CEO agent configuration.
  await page.goto(path, { waitUntil: "domcontentloaded" });

  // Guard against silent auth redirects.
  await expect(page).toHaveURL(/\/AHOA\/agents\/.*\/configuration/);

  // In current CEO UI, external adapter schema fields may not render.
  // Configure ironclaw_http via API using trusted-origin headers, then validate through the UI test button.
  const companies = (await readJsonOrSkip(await page.request.get("/api/companies"), "companies request")) as Array<{
    id: string;
  }>;
  const companyId = companies[0]?.id;
  expect(companyId, "companyId must exist").toBeTruthy();

  const ceo = await readJsonOrSkip(
    await page.request.get(`/api/agents/ceo?companyId=${companyId}`),
    "ceo request",
  ) as { id: string };

  const secrets = await readJsonOrSkip(
    await page.request.get(`/api/companies/${companyId}/secrets`),
    "secrets request",
  ) as Array<{ id: string; name?: string; key?: string }>;
  const urlSecret = secrets.find((s) => s.name === "ironclaw_url" || s.key === "ironclaw_url");
  const tokenSecret = secrets.find((s) => s.name === "ironclaw_token" || s.key === "ironclaw_token");
  expect(urlSecret, "secret ironclaw_url must exist").toBeTruthy();
  expect(tokenSecret, "secret ironclaw_token must exist").toBeTruthy();

  const directIronclawUrl = optionalEnv("IRONCLAW_E2E_URL") || optionalEnv("IRONCLAW_BASE_URL") || "http://10.12.12.106:3000";
  const directIronclawToken = optionalEnv("IRONCLAW_E2E_TOKEN") || optionalEnv("IRONCLAW_API_KEY") || "paperclip-e2e-token";

  // Hard fail early if this environment cannot discover any Ironclaw model.
  const discoveredModels = await assertModelsDiscoverable(page, directIronclawUrl, directIronclawToken);

  const patchPayload = {
    adapterType: "ironclaw_http",
    adapterConfig: {
      model: discoveredModels[0],
      timeout: 120,
      url: directIronclawUrl,
      authToken: directIronclawToken,
      env: {
        IRONCLAW_BASE_URL: {
          type: "secret_ref",
          secretId: urlSecret!.id,
          version: "latest",
        },
        IRONCLAW_API_KEY: {
          type: "secret_ref",
          secretId: tokenSecret!.id,
          version: "latest",
        },
      },
    },
  };

  const patchResponse = await page.request.patch(`/api/agents/${ceo.id}?companyId=${companyId}`, {
    headers: {
      Origin: new URL(page.url()).origin,
      Referer: `${new URL(page.url()).origin}/`,
    },
    data: patchPayload,
  });
  await readJsonOrSkip(patchResponse, "patch ceo ironclaw config");

  // Reload configuration page to pick up latest adapter state.
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/AHOA\/agents\/.*\/configuration/);
  await expect(page.getByRole("button", { name: /Ironclaw Http/i }).first()).toBeVisible();

  // Step 5: run adapter test and expect a success indication.
  const testButton = page.getByRole("button", { name: /^(test|test adapter|test connection)$/i }).first();
  await expect(testButton, "Adapter test button should be visible").toBeVisible();
  await testButton.click();

  const expectedUrlLine = page
    .getByText(new RegExp(`Valid URL format:\\s*${escapeRegExp(directIronclawUrl)}`, "i"))
    .first();
  await expect(expectedUrlLine, "Adapter test must use configured Ironclaw URL").toBeVisible({
    timeout: 30_000,
  });

  const connectionOutcome = page.getByText(/(passed|test successful)/i).first();
  await expect(connectionOutcome, "Adapter test must report successful status").toBeVisible({
    timeout: 30_000,
  });

  // Guard rails: full E2E requires explicit success without warnings.
  await expect(page.getByText(/warnings?/i).first()).not.toBeVisible();
  await expect(page.getByText(/no models discovered/i).first()).not.toBeVisible();
  await expect(page.getByText(/missing required configuration|invalid url format|failed/i).first()).not.toBeVisible();
});

test("opencode local adapter end-to-end setup test succeeds", async ({ page }) => {
  test.skip(!process.env.RUN_OPENCODE_E2E, "Set RUN_OPENCODE_E2E=1 to run OpenCode-specific E2E.");

  const path = process.env.PAPERCLIP_AGENT_CONFIG_PATH || "/AHOA/agents/ceo/configuration";

  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/AHOA\/agents\/.*\/configuration/);

  // Switch the CEO adapter to OpenCode local if it is not already selected.
  const adapterTrigger = page.getByRole("button", { name: /OpenCode.*local|Ironclaw/i }).first();
  await expect(adapterTrigger, "Adapter selector should be visible").toBeVisible();
  const adapterLabel = (await adapterTrigger.textContent()) || "";
  if (!/OpenCode \(local\)/i.test(adapterLabel)) {
    await adapterTrigger.click();
    await page.getByText(/OpenCode \(local\)/i).first().click();
  }

  // The OpenCode local adapter exposes a model chooser popover with built-in models.
  const primaryModelTrigger = page.getByRole("button", { name: /ironclaw\/qwen3\.5:9b/i }).first();
  await expect(primaryModelTrigger, "Primary model selector should be visible").toBeVisible();
  const primaryModelLabel = (await primaryModelTrigger.textContent()) || "";
  if (!/opencode\/big-pickle/i.test(primaryModelLabel)) {
    await primaryModelTrigger.click();
    await page.getByRole("button", { name: /big-pickle/i }).click();
  }
  await expect(page.getByRole("button", { name: /opencode\/big-pickle/i })).toBeVisible();

  // The OpenCode config form should expose the expected built-in fields.
  await expect(page.getByText(/primary model/i).first()).toBeVisible();
  await expect(page.getByText(/cheap model/i).first()).toBeVisible();
  const apiKeyKey = page.locator('input[value="IRONCLAW_API_KEY"]').first();
  await expect(apiKeyKey, "IRONCLAW_API_KEY binding should be visible").toBeVisible();

  const apiKeySecret = page
    .getByRole("combobox")
    .filter({ hasText: /Missing \(703211d8/i })
    .first();
  await expect(apiKeySecret, "IRONCLAW_API_KEY secret binding should be visible").toBeVisible();
  await apiKeySecret.selectOption({ label: "ironclaw_token" });

  await expect(page.locator('input[value="OPENCODE_CONFIG_CONTENT"]').first()).toBeVisible();
  await expect(page.locator('input[value="OPENCODE_DISABLE_PROJECT_CONFIG"]').first()).toBeVisible();
  await expect(page.locator('input[value="true"]').last()).toBeVisible();

  // The setup should already be valid enough for the adapter test to pass once the model is chosen.
  const testButton = page.getByRole("button", { name: /^(test|test adapter|test connection)$/i }).first();
  await expect(testButton, "Adapter test button should be visible").toBeVisible();
  await testButton.click();

  const successSignal = page
    .getByText(/(test successful|connection successful|successfully connected|all checks passed|adapter test passed)/i)
    .first();
  await expect(successSignal, "OpenCode local adapter test should succeed").toBeVisible({ timeout: 30_000 });
});
