import { test } from "node:test";
import assert from "node:assert/strict";
import { SendItToolRuntime } from "../src/tools.js";
import { SENDIT_TOOL_NAMES } from "../src/constants.js";
import type { SendItHttpClient } from "../src/http-client.js";

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

test("registers all prefixed tools with write-side optional flags", () => {
  const runtime = new SendItToolRuntime({
    httpClient: noOpHttpClient as unknown as SendItHttpClient,
    mcpClient: null,
    mcpEnabled: false,
    logger,
  });

  const registrations: Array<{ name: string; optional: boolean }> = [];
  const api = {
    registerTool: (tool: { name: string }, opts?: { optional?: boolean }) => {
      registrations.push({
        name: tool.name,
        optional: Boolean(opts?.optional),
      });
    },
  };

  runtime.registerTools(api as never);

  const expectedToolNames = Object.values(SENDIT_TOOL_NAMES);
  const actualToolNames = registrations.map((entry) => entry.name);

  assert.equal(actualToolNames.length, expectedToolNames.length);
  assert.deepEqual([...new Set(actualToolNames)].sort(), [...expectedToolNames].sort());

  const optionalTools = new Set(
    registrations.filter((entry) => entry.optional).map((entry) => entry.name)
  );

  const expectedOptionalTools = new Set([
    SENDIT_TOOL_NAMES.connectAccount,
    SENDIT_TOOL_NAMES.uploadMedia,
    SENDIT_TOOL_NAMES.publish,
    SENDIT_TOOL_NAMES.schedule,
    SENDIT_TOOL_NAMES.triggerScheduled,
    SENDIT_TOOL_NAMES.deleteScheduled,
    SENDIT_TOOL_NAMES.inbox,
    SENDIT_TOOL_NAMES.listening,
    SENDIT_TOOL_NAMES.campaigns,
    SENDIT_TOOL_NAMES.brandVoice,
    SENDIT_TOOL_NAMES.aiDraftReply,
    SENDIT_TOOL_NAMES.aiSummarizeMentions,
    SENDIT_TOOL_NAMES.aiGeneratePostBundle,
    SENDIT_TOOL_NAMES.aiCritiquePost,
  ]);

  assert.deepEqual([...optionalTools].sort(), [...expectedOptionalTools].sort());
});
