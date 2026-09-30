import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SendItToolRuntime } from '../src/tools/index.js';
import type { SendItHttpClient } from '../src/http-client.js';
import type { SendItMcpClient } from '../src/mcp-client.js';
import { detectMimeType, validateFilePath } from '../src/tools/shared.js';
import { createNormalizeOutcome } from '../src/tools/shared.js';

const logger = { info: () => {}, warn: () => {}, error: () => {} };

type MockMethod = 'get' | 'post' | 'patch' | 'delete';

function createMockHttpClient(overrides?: {
  [K in MockMethod]?: (
    path: string,
    opts?: unknown
  ) => Promise<{ success: boolean; data?: unknown; error?: unknown }>;
}) {
  return {
    get: overrides?.get ?? (async () => ({ success: true as const, data: { ok: true } })),
    post: overrides?.post ?? (async () => ({ success: true as const, data: { ok: true } })),
    patch: overrides?.patch ?? (async () => ({ success: true as const, data: { ok: true } })),
    delete: overrides?.delete ?? (async () => ({ success: true as const, data: { ok: true } })),
  } as unknown as SendItHttpClient;
}

function createMockMcpClient(callToolResult?: unknown): SendItMcpClient {
  return {
    initialize: async () => ({ success: true as const, data: {} }),
    listTools: async () => ({
      success: true as const,
      data: {
        tools: [
          { name: 'draft_reply' },
          { name: 'summarize_mentions' },
          { name: 'generate_post_bundle' },
          { name: 'critique_post' },
          { name: 'get_unified_analytics' },
          { name: 'get_anomaly_alerts' },
          { name: 'get_benchmark_comparison' },
          { name: 'list_ad_accounts' },
          { name: 'create_ad_campaign' },
          { name: 'list_ad_campaigns' },
          { name: 'update_ad_campaign' },
          { name: 'create_ad_creative' },
          { name: 'get_ad_performance' },
          { name: 'get_unified_ad_report' },
          { name: 'list_conversations' },
          { name: 'get_conversation' },
          { name: 'reply_to_conversation' },
          { name: 'update_conversation' },
          { name: 'get_inbox_summary' },
          { name: 'escalate_to_support' },
          { name: 'list_agents' },
          { name: 'invoke_agent' },
          { name: 'get_agent_run' },
          { name: 'list_agent_runs' },
          { name: 'get_agent_policies' },
          { name: 'update_agent_policy' },
          { name: 'list_workflows' },
          { name: 'create_workflow' },
          { name: 'update_workflow' },
          { name: 'delete_workflow' },
          { name: 'trigger_workflow' },
          { name: 'list_workflow_runs' },
          { name: 'get_workflow_run' },
          { name: 'list_connectors' },
          { name: 'get_connector_capabilities' },
          { name: 'connect_connector' },
          { name: 'disconnect_connector' },
          { name: 'list_connected_connectors' },
          { name: 'get_connector_health' },
          { name: 'execute_connector_operation' },
          { name: 'create_scheduled_report' },
          { name: 'get_attribution_report' },
        ],
      },
    }),
    callTool: async () => ({ success: true as const, data: callToolResult ?? { ok: true } }),
  } as unknown as SendItMcpClient;
}

function collectTools(
  runtime: SendItToolRuntime
): Map<string, { execute: (...args: unknown[]) => Promise<unknown> }> {
  const tools = new Map<string, { execute: (...args: unknown[]) => Promise<unknown> }>();
  const api = {
    registerTool: (tool: unknown) => {
      const t = tool as { name: string; execute: (...args: unknown[]) => Promise<unknown> };
      tools.set(t.name, t);
    },
  };
  runtime.registerTools(api as never);
  return tools;
}

function parseResult(result: unknown): {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string; retryable?: boolean };
} {
  return JSON.parse((result as { content: Array<{ text: string }> }).content[0].text);
}

// ── Core Tools ──────────────────────────────────────────────────────

describe('core tools execute', () => {
  test('sendit_capabilities happy path', async () => {
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_capabilities')!.execute('call-1', {});
    assert.equal(parseResult(result).success, true);
  });

  test('sendit_list_accounts passes pagination', async () => {
    let capturedQuery: unknown;
    const httpClient = createMockHttpClient({
      get: async (_path, opts) => {
        capturedQuery = (opts as { query?: unknown })?.query;
        return { success: true, data: { accounts: [] } };
      },
    });
    const runtime = new SendItToolRuntime({
      httpClient,
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    await tools.get('sendit_list_accounts')!.execute('call-1', { limit: 10, offset: 5 });
    assert.deepEqual(capturedQuery, { limit: 10, offset: 5 });
  });

  test('sendit_publish sends typed content', async () => {
    let capturedBody: unknown;
    const httpClient = createMockHttpClient({
      post: async (_path, opts) => {
        capturedBody = (opts as { body?: unknown })?.body;
        return { success: true, data: { published: true } };
      },
    });
    const runtime = new SendItToolRuntime({
      httpClient,
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    await tools.get('sendit_publish')!.execute('call-1', {
      platforms: ['x', 'linkedin'],
      content: { text: 'Hello world', mediaUrl: 'https://example.com/img.png' },
    });
    assert.deepEqual(capturedBody, {
      platforms: ['x', 'linkedin'],
      content: { text: 'Hello world', mediaUrl: 'https://example.com/img.png' },
    });
  });

  test('sendit_upload_media requires filePath or mediaUrl', async () => {
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_upload_media')!.execute('call-1', {});
    const parsed = parseResult(result);
    assert.equal(parsed.success, false);
    assert.equal(parsed.error!.code, 'invalid_input');
  });

  test('sendit_analytics allows optional platform', async () => {
    let capturedQuery: unknown;
    const httpClient = createMockHttpClient({
      get: async (_path, opts) => {
        capturedQuery = (opts as { query?: unknown })?.query;
        return { success: true, data: { metrics: {} } };
      },
    });
    const runtime = new SendItToolRuntime({
      httpClient,
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    await tools.get('sendit_analytics')!.execute('call-1', {});
    assert.deepEqual(capturedQuery, { platform: undefined, limit: undefined, offset: undefined });
  });

  test('sendit_delete_post requires platform and postId', async () => {
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools
      .get('sendit_delete_post')!
      .execute('call-1', { platform: 'x', postId: '123' });
    assert.equal(parseResult(result).success, true);
  });

  test('sendit_preview happy path', async () => {
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_preview')!.execute('call-1', {
      platforms: ['x'],
      content: { text: 'Preview test' },
    });
    assert.equal(parseResult(result).success, true);
  });

  test('sendit_status returns aggregated diagnostics with correct shape', async () => {
    const httpClient = createMockHttpClient({
      get: async (path) => {
        if (path === '/capabilities')
          return { success: true, data: { tier: 'pro', features: ['publishing'] } };
        if (path === '/accounts')
          return {
            success: true,
            data: { accounts: [{ platform: 'x' }, { platform: 'linkedin' }] },
          };
        return { success: true, data: {} };
      },
    });
    const runtime = new SendItToolRuntime({
      httpClient,
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'api_key',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_status')!.execute('call-1', {});
    const parsed = parseResult(result);
    assert.equal(parsed.success, true);
    const data = parsed.data as Record<string, unknown>;
    assert.ok(data.version, 'Should have version');
    assert.ok(data.auth, 'Should have auth');
    assert.ok(data.accounts, 'Should have accounts');
    assert.ok(data.mcp, 'Should have mcp');
    assert.ok(data.api, 'Should have api');
    const auth = data.auth as Record<string, unknown>;
    assert.equal(auth.mode, 'api_key');
    assert.equal(auth.valid, true);
    const mcp = data.mcp as Record<string, unknown>;
    assert.equal(mcp.enabled, false);
  });

  test('sendit_status partial failure still returns result', async () => {
    const httpClient = createMockHttpClient({
      get: async (path) => {
        if (path === '/capabilities')
          return {
            success: false,
            error: { code: 'unauthorized', message: 'Bad key', status: 401 },
          };
        return { success: true, data: { accounts: [] } };
      },
    });
    const runtime = new SendItToolRuntime({
      httpClient,
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_status')!.execute('call-1', {});
    const parsed = parseResult(result);
    assert.equal(parsed.success, true);
    const data = parsed.data as Record<string, unknown>;
    const auth = data.auth as Record<string, unknown>;
    assert.equal(auth.valid, false);
  });

  test('sendit_help returns overview when no topic', async () => {
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_help')!.execute('call-1', {});
    const parsed = parseResult(result);
    assert.equal(parsed.success, true);
    const data = parsed.data as Record<string, unknown>;
    assert.ok(data.totalTools, 'Should have totalTools');
    assert.ok(data.groups, 'Should have groups');
  });

  test('sendit_help returns matching tools for topic', async () => {
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_help')!.execute('call-1', { topic: 'campaign' });
    const parsed = parseResult(result);
    assert.equal(parsed.success, true);
    const data = parsed.data as Record<string, unknown>;
    assert.ok((data.matchCount as number) > 0, 'Should find campaign-related tools');
  });
});

// ── Growth Tools ────────────────────────────────────────────────────

describe('growth tools execute', () => {
  test('sendit_inbox list action', async () => {
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_inbox')!.execute('call-1', { action: 'list' });
    assert.equal(parseResult(result).success, true);
  });

  test('sendit_inbox reply requires threadId and text', async () => {
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_inbox')!.execute('call-1', { action: 'reply' });
    const parsed = parseResult(result);
    assert.equal(parsed.success, false);
    assert.equal(parsed.error!.code, 'invalid_input');
  });

  test('sendit_listening rejects invalid action', async () => {
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools
      .get('sendit_listening')!
      .execute('call-1', { action: 'nonexistent' });
    const parsed = parseResult(result);
    assert.equal(parsed.success, false);
    assert.equal(parsed.error!.code, 'invalid_action');
  });

  test('sendit_listening get_alert requires id', async () => {
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_listening')!.execute('call-1', { action: 'get_alert' });
    const parsed = parseResult(result);
    assert.equal(parsed.success, false);
    assert.equal(parsed.error!.code, 'invalid_input');
  });

  test('sendit_campaigns get requires id', async () => {
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_campaigns')!.execute('call-1', { action: 'get' });
    const parsed = parseResult(result);
    assert.equal(parsed.success, false);
    assert.equal(parsed.error!.code, 'invalid_input');
  });

  test('sendit_campaigns delete requires id', async () => {
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_campaigns')!.execute('call-1', { action: 'delete' });
    const parsed = parseResult(result);
    assert.equal(parsed.success, false);
    assert.equal(parsed.error!.code, 'invalid_input');
  });

  test('sendit_brand_voice create assembles typed fields', async () => {
    let capturedBody: unknown;
    const httpClient = createMockHttpClient({
      post: async (_path, opts) => {
        capturedBody = (opts as { body?: unknown })?.body;
        return { success: true, data: { id: 'bv-1' } };
      },
    });
    const runtime = new SendItToolRuntime({
      httpClient,
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    await tools.get('sendit_brand_voice')!.execute('call-1', {
      action: 'create',
      name: 'Professional',
      tone: 'formal',
      doRules: ['Use active voice'],
    });
    const body = capturedBody as Record<string, unknown>;
    assert.equal(body.name, 'Professional');
    assert.equal(body.tone, 'formal');
    assert.deepEqual(body.doRules, ['Use active voice']);
  });

  test('sendit_content_library publish requires id and platforms', async () => {
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools
      .get('sendit_content_library')!
      .execute('call-1', { action: 'publish' });
    const parsed = parseResult(result);
    assert.equal(parsed.success, false);
    assert.equal(parsed.error!.code, 'invalid_input');
  });

  test('sendit_webhooks create uses typed url+events', async () => {
    let capturedBody: unknown;
    const httpClient = createMockHttpClient({
      post: async (_path, opts) => {
        capturedBody = (opts as { body?: unknown })?.body;
        return { success: true, data: { id: 'wh-1' } };
      },
    });
    const runtime = new SendItToolRuntime({
      httpClient,
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    await tools.get('sendit_webhooks')!.execute('call-1', {
      action: 'create',
      url: 'https://example.com/hook',
      events: ['post.published'],
    });
    const body = capturedBody as Record<string, unknown>;
    assert.equal(body.url, 'https://example.com/hook');
    assert.deepEqual(body.events, ['post.published']);
  });

  test('sendit_bulk_schedule validate requires csvData', async () => {
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools
      .get('sendit_bulk_schedule')!
      .execute('call-1', { action: 'validate' });
    const parsed = parseResult(result);
    assert.equal(parsed.success, false);
    assert.equal(parsed.error!.code, 'invalid_input');
  });

  test('sendit_ai_media generate uses typed fields', async () => {
    let capturedBody: unknown;
    const httpClient = createMockHttpClient({
      post: async (_path, opts) => {
        capturedBody = (opts as { body?: unknown })?.body;
        return { success: true, data: { jobId: 'j-1' } };
      },
    });
    const runtime = new SendItToolRuntime({
      httpClient,
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    await tools.get('sendit_ai_media')!.execute('call-1', {
      action: 'generate',
      provider: 'sora',
      prompt: 'A sunset',
      media_type: 'video',
    });
    const body = capturedBody as Record<string, unknown>;
    assert.equal(body.provider, 'sora');
    assert.equal(body.prompt, 'A sunset');
  });

  test('sendit_ai_media status requires jobId', async () => {
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_ai_media')!.execute('call-1', { action: 'status' });
    const parsed = parseResult(result);
    assert.equal(parsed.success, false);
    assert.equal(parsed.error!.code, 'invalid_input');
  });

  test('sendit_best_times happy path', async () => {
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_best_times')!.execute('call-1', { platform: 'x' });
    assert.equal(parseResult(result).success, true);
  });

  test('sendit_content_score happy path', async () => {
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_content_score')!.execute('call-1', {
      platforms: ['x'],
      text: 'Test post',
    });
    assert.equal(parseResult(result).success, true);
  });
});

// ── Advanced Tools ──────────────────────────────────────────────────

describe('advanced tools execute', () => {
  test('MCP tools return mcp_disabled when MCP is off', async () => {
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);

    for (const toolName of [
      'sendit_ai_draft_reply',
      'sendit_ai_summarize_mentions',
      'sendit_ai_generate_post_bundle',
      'sendit_ai_critique_post',
      'sendit_unified_analytics',
      'sendit_anomaly_alerts',
      'sendit_benchmark',
      'sendit_ads',
      'sendit_crm',
      'sendit_agents',
      'sendit_workflows',
      'sendit_connectors',
    ]) {
      const tool = tools.get(toolName);
      assert.ok(tool, `Tool ${toolName} should be registered`);
      const result = await tool.execute('call-1', getMinimalParams(toolName));
      const parsed = parseResult(result);
      assert.equal(parsed.success, false, `${toolName} should fail when MCP is disabled`);
      assert.equal(parsed.error!.code, 'mcp_disabled');
    }
  });

  test('MCP tools work when MCP is enabled', async () => {
    const mcpClient = createMockMcpClient({ result: 'success' });
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient,
      mcpEnabled: true,
      authMode: 'auto',
      logger,
    });
    await runtime.probeCapabilities();
    const tools = collectTools(runtime);

    const result = await tools
      .get('sendit_ai_draft_reply')!
      .execute('call-1', { mention_id: 'm-1' });
    assert.equal(parseResult(result).success, true);
  });

  test('sendit_ads rejects invalid action', async () => {
    const mcpClient = createMockMcpClient();
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient,
      mcpEnabled: true,
      authMode: 'auto',
      logger,
    });
    await runtime.probeCapabilities();
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_ads')!.execute('call-1', { action: 'invalid_action' });
    const parsed = parseResult(result);
    assert.equal(parsed.success, false);
    assert.equal(parsed.error!.code, 'invalid_action');
  });

  test('sendit_crm action routes to correct MCP tool', async () => {
    let capturedToolName: string | undefined;
    const mcpClient = {
      initialize: async () => ({ success: true as const, data: {} }),
      listTools: async () => ({
        success: true as const,
        data: {
          tools: [
            { name: 'list_conversations' },
            { name: 'get_conversation' },
            { name: 'reply_to_conversation' },
            { name: 'update_conversation' },
            { name: 'get_inbox_summary' },
            { name: 'escalate_to_support' },
          ],
        },
      }),
      callTool: async (name: string) => {
        capturedToolName = name;
        return { success: true as const, data: { ok: true } };
      },
    } as unknown as SendItMcpClient;

    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient,
      mcpEnabled: true,
      authMode: 'auto',
      logger,
    });
    await runtime.probeCapabilities();
    const tools = collectTools(runtime);

    await tools.get('sendit_crm')!.execute('call-1', { action: 'get_summary' });
    assert.equal(capturedToolName, 'get_inbox_summary');
  });

  test('sendit_unified_analytics defaults to query when action omitted', async () => {
    const mcpClient = createMockMcpClient({ metrics: {} });
    const runtime = new SendItToolRuntime({
      httpClient: createMockHttpClient(),
      mcpClient,
      mcpEnabled: true,
      authMode: 'auto',
      logger,
    });
    await runtime.probeCapabilities();
    const tools = collectTools(runtime);

    const result = await tools
      .get('sendit_unified_analytics')!
      .execute('call-1', { platforms: ['x'] });
    assert.equal(parseResult(result).success, true);
  });
});

// ── Error enrichment ────────────────────────────────────────────────

describe('error enrichment', () => {
  test('401 errors include api-key re-auth guidance', async () => {
    const httpClient = createMockHttpClient({
      get: async () => ({
        success: false,
        error: { code: 'unauthorized', message: 'Invalid API key', status: 401 },
      }),
    });
    const runtime = new SendItToolRuntime({
      httpClient,
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'api_key',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_capabilities')!.execute('call-1', {});
    const parsed = parseResult(result);
    assert.equal(parsed.success, false);
    assert.ok(parsed.error!.message.includes('--mode api-key'), 'Should include api-key mode');
  });

  test('401 errors include oauth re-auth guidance when mode is oauth', async () => {
    const httpClient = createMockHttpClient({
      get: async () => ({
        success: false,
        error: { code: 'unauthorized', message: 'Token expired', status: 401 },
      }),
    });
    const runtime = new SendItToolRuntime({
      httpClient,
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'oauth',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_capabilities')!.execute('call-1', {});
    const parsed = parseResult(result);
    assert.equal(parsed.success, false);
    assert.ok(parsed.error!.message.includes('--mode oauth'), 'Should include oauth mode');
  });

  test('403 errors include tier guidance', async () => {
    const httpClient = createMockHttpClient({
      get: async () => ({
        success: false,
        error: { code: 'forbidden', message: 'Feature not available', status: 403 },
      }),
    });
    const runtime = new SendItToolRuntime({
      httpClient,
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_capabilities')!.execute('call-1', {});
    const parsed = parseResult(result);
    assert.ok(parsed.error!.message.includes('tier'), 'Should include tier guidance');
  });

  test('404 errors include resource guidance', async () => {
    const httpClient = createMockHttpClient({
      get: async () => ({
        success: false,
        error: { code: 'not_found', message: 'Schedule not found', status: 404 },
      }),
    });
    const runtime = new SendItToolRuntime({
      httpClient,
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_list_scheduled')!.execute('call-1', {});
    const parsed = parseResult(result);
    assert.ok(parsed.error!.message.includes('list tool'), 'Should include resource guidance');
  });

  test('429 errors include rate limit guidance and retryable', async () => {
    const httpClient = createMockHttpClient({
      get: async () => ({
        success: false,
        error: { code: 'rate_limited', message: 'Too many requests', status: 429 },
      }),
    });
    const runtime = new SendItToolRuntime({
      httpClient,
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_capabilities')!.execute('call-1', {});
    const parsed = parseResult(result);
    assert.ok(parsed.error!.message.includes('Rate limited'), 'Should include rate limit guidance');
    assert.equal(parsed.error!.retryable, true, 'Should be retryable');
  });

  test('500 errors include doctor guidance and retryable', async () => {
    const httpClient = createMockHttpClient({
      get: async () => ({
        success: false,
        error: { code: 'internal_error', message: 'Server error', status: 500 },
      }),
    });
    const runtime = new SendItToolRuntime({
      httpClient,
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_capabilities')!.execute('call-1', {});
    const parsed = parseResult(result);
    assert.ok(parsed.error!.message.includes('doctor'), 'Should include doctor guidance');
    assert.equal(parsed.error!.retryable, true, 'Should be retryable');
  });

  test('502/503 errors include service unavailable guidance', async () => {
    const httpClient = createMockHttpClient({
      get: async () => ({
        success: false,
        error: { code: 'service_unavailable', message: 'Upstream error', status: 502 },
      }),
    });
    const runtime = new SendItToolRuntime({
      httpClient,
      mcpClient: null,
      mcpEnabled: false,
      authMode: 'auto',
      logger,
    });
    const tools = collectTools(runtime);
    const result = await tools.get('sendit_capabilities')!.execute('call-1', {});
    const parsed = parseResult(result);
    assert.ok(
      parsed.error!.message.includes('temporarily unavailable'),
      'Should include service unavailable guidance'
    );
    assert.equal(parsed.error!.retryable, true, 'Should be retryable');
  });
});

// ── File upload security ────────────────────────────────────────────

describe('file path validation', () => {
  test('rejects path with .. traversal', () => {
    const result = validateFilePath('../../etc/passwd');
    assert.equal(result.valid, false);
    assert.ok(result.error!.includes('traversal') || result.error!.includes('restricted'));
  });

  test('rejects /etc/passwd', () => {
    const result = validateFilePath('/etc/passwd');
    assert.equal(result.valid, false);
    assert.ok(result.error!.includes('restricted'));
  });

  test('rejects /proc paths', () => {
    const result = validateFilePath('/proc/self/environ');
    assert.equal(result.valid, false);
  });

  test('rejects ~/.ssh paths', () => {
    const result = validateFilePath(`${process.env.HOME}/.ssh/id_rsa`);
    assert.equal(result.valid, false);
  });

  test('allows normal file paths', () => {
    const result = validateFilePath('/tmp/image.png');
    assert.equal(result.valid, true);
  });

  test('allows /var/folders (macOS temp)', () => {
    const result = validateFilePath('/var/folders/T0/upload.jpg');
    assert.equal(result.valid, true);
  });
});

// ── MIME type detection ─────────────────────────────────────────────

describe('detectMimeType extended formats', () => {
  test('.svg returns image/svg+xml', () => {
    assert.equal(detectMimeType('icon.svg'), 'image/svg+xml');
  });

  test('.avif returns image/avif', () => {
    assert.equal(detectMimeType('photo.avif'), 'image/avif');
  });

  test('.heic returns image/heic', () => {
    assert.equal(detectMimeType('img.heic'), 'image/heic');
  });

  test('.mkv returns video/x-matroska', () => {
    assert.equal(detectMimeType('video.mkv'), 'video/x-matroska');
  });

  test('unknown extension returns octet-stream', () => {
    assert.equal(detectMimeType('file.xyz'), 'application/octet-stream');
  });
});

// ── normalizeOutcome factory ────────────────────────────────────────

describe('createNormalizeOutcome', () => {
  test('produces auth-mode-specific 401 message for api_key', () => {
    const normalize = createNormalizeOutcome('api_key');
    const result = normalize({
      success: false,
      error: { code: 'unauthorized', message: 'Bad key', status: 401 },
    });
    assert.ok(result.error!.message.includes('--mode api-key'));
  });

  test('produces auth-mode-specific 401 message for oauth', () => {
    const normalize = createNormalizeOutcome('oauth');
    const result = normalize({
      success: false,
      error: { code: 'unauthorized', message: 'Expired', status: 401 },
    });
    assert.ok(result.error!.message.includes('--mode oauth'));
  });

  test('429 sets retryable to true', () => {
    const normalize = createNormalizeOutcome();
    const result = normalize({
      success: false,
      error: { code: 'rate_limited', message: 'Slow down', status: 429 },
    });
    assert.equal(result.error!.retryable, true);
  });
});

// Helper for minimal params per tool
function getMinimalParams(toolName: string): Record<string, unknown> {
  switch (toolName) {
    case 'sendit_ai_draft_reply':
      return { mention_id: 'm-1' };
    case 'sendit_ai_summarize_mentions':
      return {};
    case 'sendit_ai_generate_post_bundle':
      return { platforms: ['x'], prompt: 'test' };
    case 'sendit_ai_critique_post':
      return { platforms: ['x'], text: 'test' };
    case 'sendit_unified_analytics':
      return {};
    case 'sendit_anomaly_alerts':
      return {};
    case 'sendit_benchmark':
      return { platform: 'x' };
    case 'sendit_ads':
      return { action: 'list_accounts' };
    case 'sendit_crm':
      return { action: 'list_conversations' };
    case 'sendit_agents':
      return { action: 'list' };
    case 'sendit_workflows':
      return { action: 'list' };
    case 'sendit_connectors':
      return { action: 'list' };
    default:
      return {};
  }
}
