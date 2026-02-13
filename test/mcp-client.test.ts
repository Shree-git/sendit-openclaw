import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { SendItMcpClient } from "../src/mcp-client.js";

const originalFetch = globalThis.fetch;

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("initialize stores session and callTool works", async () => {
  const requests: Array<{ method: string; hasSession: boolean }> = [];

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}")) as { method?: string; id?: string };
    const headers = new Headers(init?.headers);
    requests.push({
      method: body.method || "",
      hasSession: Boolean(headers.get("mcp-session-id")),
    });

    if (body.method === "initialize") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: { ok: true },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "mcp-session-id": "session_test_1",
          },
        }
      );
    }

    if (body.method === "notifications/initialized") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {},
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: { envelope: { success: true }, tool: "ok" },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  const client = new SendItMcpClient(
    "https://sendit.infiniteappsai.com/api/mcp",
    2_000,
    async () => "sk_live_test",
    true,
    { max: 0, backoffMs: 1 },
    logger
  );

  const initResult = await client.initialize();
  assert.equal(initResult.success, true);

  const callResult = await client.callTool("critique_post", { text: "hello" });
  assert.equal(callResult.success, true);

  assert.equal(requests[0]?.method, "initialize");
  assert.equal(requests[2]?.hasSession, true);
});
