import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sendItPlugin from '../index.js';
import { SENDIT_TOOL_NAMES } from '../src/constants.js';

test('registers synchronously with credentials and no network access on every host load', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Registration must not use the network'); };
  try {
    for (let load = 0; load < 2; load += 1) {
      const names: string[] = [];
      const api = {
        config: {},
        pluginConfig: { auth: { apiKey: 'test-key' } },
        logger: { info() {}, warn() {}, error() {} },
        registerTool(tool: { name: string }) { names.push(tool.name); },
        registerProvider() {},
        registerCli() {},
      };
      const result = sendItPlugin.register(api as never);
      assert.equal(result, undefined);
      assert.deepEqual(names.sort(), Object.values(SENDIT_TOOL_NAMES).sort());
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('manifest declares the runtime tool ownership and matching optional flags', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../openclaw.plugin.json', import.meta.url), 'utf8'));
  assert.deepEqual([...manifest.contracts.tools].sort(), Object.values(SENDIT_TOOL_NAMES).sort());
  const api = {
    config: {},
    pluginConfig: {},
    logger: { info() {}, warn() {}, error() {} },
    registerTool(tool: { name: string }, options?: { optional?: boolean }) {
      assert.equal(manifest.toolMetadata[tool.name].optional, Boolean(options?.optional));
    },
    registerProvider() {},
    registerCli() {},
  };
  sendItPlugin.register(api as never);
});
