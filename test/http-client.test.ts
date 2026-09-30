import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { SendItHttpClient } from '../src/http-client.js';
import type { SendItPluginConfig } from '../src/config.js';

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

const baseConfig: SendItPluginConfig = {
  enabled: true,
  baseUrl: 'https://sendit.infiniteappsai.com',
  auth: {
    mode: 'api_key',
    apiKey: 'sk_live_test',
  },
  teamId: 'team_123',
  timeouts: { requestMs: 2_000, mcpMs: 2_000 },
  retries: { max: 1, backoffMs: 1 },
  mcp: { enabled: true, endpoint: 'https://sendit.infiniteappsai.com/api/mcp' },
  telemetry: { enabled: true },
  locale: 'en',
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('injects auth, team, and integration headers', async () => {
  let capturedHeaders: Headers | null = null;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ success: true, ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const client = new SendItHttpClient(baseConfig, logger);
  const result = await client.get('/accounts');

  assert.equal(result.success, true);
  assert.ok(capturedHeaders);
  const headers = capturedHeaders as Headers;
  assert.equal(headers.get('authorization'), 'Bearer sk_live_test');
  assert.equal(headers.get('x-team-id'), 'team_123');
  assert.equal(headers.get('x-sendit-integration'), 'sendit');
  assert.equal(headers.get('x-sendit-skill-pack'), 'sendit-openclaw');
});

test('retries once on 429 then succeeds', async () => {
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ error: 'rate limited' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, retry: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const client = new SendItHttpClient(baseConfig, logger);
  const result = await client.get('/capabilities');

  assert.equal(calls, 2);
  assert.equal(result.success, true);
});
