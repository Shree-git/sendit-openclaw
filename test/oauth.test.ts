import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { refreshSendItOAuthToken } from "../src/oauth.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("returns null when refresh token is missing", async () => {
  const refreshed = await refreshSendItOAuthToken({
    baseUrl: "https://sendit.infiniteappsai.com",
    oauth: {
      accessToken: "access_old",
    },
  });

  assert.equal(refreshed, null);
});

test("refreshes token and preserves client metadata", async () => {
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        access_token: "access_new",
        refresh_token: "refresh_new",
        expires_in: 3600,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  const refreshed = await refreshSendItOAuthToken({
    baseUrl: "https://sendit.infiniteappsai.com",
    oauth: {
      accessToken: "access_old",
      refreshToken: "refresh_old",
      clientId: "client_123",
      clientSecret: "secret_123",
      expiresAt: Date.now() + 10_000,
    },
  });

  assert.ok(refreshed);
  assert.equal(refreshed?.accessToken, "access_new");
  assert.equal(refreshed?.refreshToken, "refresh_new");
  assert.equal(refreshed?.clientId, "client_123");
  assert.equal(refreshed?.clientSecret, "secret_123");
  assert.equal(typeof refreshed?.expiresAt, "number");
});
