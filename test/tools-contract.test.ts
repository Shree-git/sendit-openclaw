import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SendItToolRuntime } from '../src/tools/index.js';
import { SENDIT_TOOL_NAMES } from '../src/constants.js';
import type { SendItHttpClient } from '../src/http-client.js';

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

const noOpHttpClient = {
  async get() {
    return { success: true as const, data: {} };
  },
  async post() {
    return { success: true as const, data: {} };
  },
  async patch() {
    return { success: true as const, data: {} };
  },
  async delete() {
    return { success: true as const, data: {} };
  },
};

test('registers all 41 prefixed tools with correct optional flags', () => {
  const runtime = new SendItToolRuntime({
    httpClient: noOpHttpClient as unknown as SendItHttpClient,
    mcpClient: null,
    mcpEnabled: false,
    authMode: 'auto',
    logger,
  });

  const registrations: Array<{ name: string; optional: boolean }> = [];
  const api = {
    registerTool: (tool: unknown, opts?: { optional?: boolean }) => {
      const t = tool as { name: string };
      registrations.push({
        name: t.name,
        optional: Boolean(opts?.optional),
      });
    },
  };

  runtime.registerTools(api as never);

  const expectedToolNames = Object.values(SENDIT_TOOL_NAMES);
  const actualToolNames = registrations.map((entry) => entry.name);

  assert.equal(
    actualToolNames.length,
    expectedToolNames.length,
    `Expected ${expectedToolNames.length} tools, got ${actualToolNames.length}. ` +
      `Missing: ${expectedToolNames.filter((n) => !actualToolNames.includes(n)).join(', ')}. ` +
      `Extra: ${actualToolNames.filter((n) => !expectedToolNames.includes(n as never)).join(', ')}`
  );
  assert.deepEqual([...new Set(actualToolNames)].sort(), [...expectedToolNames].sort());

  // Required tools (8): capabilities, listAccounts, requirements, validate, listScheduled, analytics, status
  const expectedRequiredTools = new Set([
    SENDIT_TOOL_NAMES.capabilities,
    SENDIT_TOOL_NAMES.listAccounts,
    SENDIT_TOOL_NAMES.requirements,
    SENDIT_TOOL_NAMES.validate,
    SENDIT_TOOL_NAMES.listScheduled,
    SENDIT_TOOL_NAMES.analytics,
    SENDIT_TOOL_NAMES.status,
  ]);

  for (const tool of registrations) {
    if (expectedRequiredTools.has(tool.name as never)) {
      assert.equal(tool.optional, false, `${tool.name} should be required`);
    } else {
      assert.equal(tool.optional, true, `${tool.name} should be optional`);
    }
  }
});

test('no duplicate tool names', () => {
  const runtime = new SendItToolRuntime({
    httpClient: noOpHttpClient as unknown as SendItHttpClient,
    mcpClient: null,
    mcpEnabled: false,
    authMode: 'auto',
    logger,
  });

  const names: string[] = [];
  const api = {
    registerTool: (tool: unknown) => {
      const t = tool as { name: string };
      names.push(t.name);
    },
  };

  runtime.registerTools(api as never);

  const unique = new Set(names);
  assert.equal(
    unique.size,
    names.length,
    `Duplicate tool names found: ${names.filter((n, i) => names.indexOf(n) !== i)}`
  );
});

test('tool count matches SENDIT_TOOL_NAMES', () => {
  const expectedCount = Object.keys(SENDIT_TOOL_NAMES).length;
  assert.equal(expectedCount, 41, `Expected 41 tool name entries, got ${expectedCount}`);
});
