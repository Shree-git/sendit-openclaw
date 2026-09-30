import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Type } from '@sinclair/typebox';
import { SENDIT_TOOL_NAMES } from '../constants.js';
import {
  PLATFORM_TYPE,
  CONTENT_SCHEMA,
  PAGINATION_PARAMS,
  TEAM_ID_PARAM,
  validateFilePath,
  detectMimeType,
  basename,
  fail,
  toToolResult,
  type ToolRuntimeDeps,
  type OpenClawPluginApi,
} from './shared.js';

export function registerCoreTools(api: OpenClawPluginApi, deps: ToolRuntimeDeps): void {
  // ── sendit_capabilities ──────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.capabilities,
      label: 'SendIt Capabilities',
      description:
        'Discover available SendIt features, platforms, and tool capabilities for the current API key tier. ' +
        'Returns GA and beta feature flags. Call this first when unsure which tools or platforms are available. ' +
        'Related: Use sendit_status for a quick diagnostic check. Use sendit_requirements for platform-specific constraints.',
      parameters: Type.Object({
        include_beta: Type.Optional(
          Type.Boolean({ description: 'Include beta/unreleased features. Default false.' })
        ),
        ...TEAM_ID_PARAM,
      }),
      execute: async (_toolCallId: string, params: { include_beta?: boolean }) => {
        const result = await deps.httpClient.get('/capabilities', {
          query: {
            include_beta:
              typeof params.include_beta === 'boolean' ? params.include_beta : undefined,
          },
        });
        return toToolResult(deps.normalizeOutcome(result));
      },
    },
    { names: [SENDIT_TOOL_NAMES.capabilities] }
  );

  // ── sendit_list_accounts ─────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.listAccounts,
      label: 'SendIt List Accounts',
      description:
        'List all connected social media accounts with their platform, username, and status. ' +
        'Use this to check which platforms are connected before publishing or to verify account health. ' +
        'Related: Use sendit_connect_account to add platforms. Use sendit_status for overall health.',
      parameters: Type.Object({
        ...PAGINATION_PARAMS,
        ...TEAM_ID_PARAM,
      }),
      execute: async (_toolCallId: string, params: { limit?: number; offset?: number }) => {
        const result = await deps.httpClient.get('/accounts', {
          query: { limit: params.limit, offset: params.offset },
        });
        return toToolResult(deps.normalizeOutcome(result));
      },
    },
    { names: [SENDIT_TOOL_NAMES.listAccounts] }
  );

  // ── sendit_connect_account ───────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.connectAccount,
      label: 'SendIt Connect Account',
      description:
        'Get an OAuth connect URL for a specific social platform. ' +
        'The user must open the returned URL in a browser to complete the OAuth flow. ' +
        'After completion, call sendit_list_accounts to verify the account is connected. ' +
        'Related: Use sendit_list_accounts to verify connection. Use sendit_capabilities to check supported platforms.',
      parameters: Type.Object({
        platform: PLATFORM_TYPE,
        ...TEAM_ID_PARAM,
      }),
      execute: async (_toolCallId: string, params: { platform: string }) => {
        const result = await deps.httpClient.get(`/connect/${params.platform}`);
        return toToolResult(deps.normalizeOutcome(result));
      },
    },
    { names: [SENDIT_TOOL_NAMES.connectAccount], optional: true }
  );

  // ── sendit_requirements ──────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.requirements,
      label: 'SendIt Requirements',
      description:
        'Get content requirements and constraints for a specific platform. ' +
        'Returns character limits, supported media types, aspect ratios, and formatting rules. ' +
        'Call this before composing content to ensure it meets platform requirements. ' +
        'Related: Use sendit_validate to check content against these requirements.',
      parameters: Type.Object({
        platform: PLATFORM_TYPE,
        ...TEAM_ID_PARAM,
      }),
      execute: async (_toolCallId: string, params: { platform: string }) => {
        const result = await deps.httpClient.get('/requirements', {
          query: { platform: params.platform },
        });
        return toToolResult(deps.normalizeOutcome(result));
      },
    },
    { names: [SENDIT_TOOL_NAMES.requirements] }
  );

  // ── sendit_validate ──────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.validate,
      label: 'SendIt Validate Content',
      description:
        'Validate content against platform constraints before publishing or scheduling. ' +
        'Returns per-platform validation results with specific errors (character limits, missing media, unsupported formats). ' +
        'Always call this before sendit_publish or sendit_schedule to avoid publishing failures. ' +
        'Related: Use sendit_preview to visualize content. Use sendit_publish when validation passes.',
      parameters: Type.Object({
        platforms: Type.Array(PLATFORM_TYPE, {
          minItems: 1,
          description: 'Target platforms to validate against.',
        }),
        content: CONTENT_SCHEMA,
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: { platforms: string[]; content: Record<string, unknown> }
      ) => {
        const result = await deps.httpClient.post('/validate', {
          body: params,
        });
        return toToolResult(deps.normalizeOutcome(result));
      },
    },
    { names: [SENDIT_TOOL_NAMES.validate] }
  );

  // ── sendit_upload_media ──────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.uploadMedia,
      label: 'SendIt Upload Media',
      description:
        'Upload a local media file or register an existing media URL with SendIt. ' +
        'Returns a stable media URL that can be used in content.mediaUrl or content.mediaUrls fields. ' +
        'Supports images (JPEG, PNG, GIF, WebP) and videos (MP4, MOV, WebM). ' +
        'Related: Use the returned URL in content.mediaUrl with sendit_publish or sendit_schedule.',
      parameters: Type.Object({
        filePath: Type.Optional(Type.String({ description: 'Local file path to upload.' })),
        mediaUrl: Type.Optional(Type.String({ description: 'Existing media URL to register.' })),
        folder: Type.Optional(Type.String({ description: 'Organizational folder name.' })),
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: { filePath?: string; mediaUrl?: string; folder?: string }
      ) => {
        if (!params.filePath && !params.mediaUrl) {
          return toToolResult(
            fail({
              code: 'invalid_input',
              message: 'Either filePath or mediaUrl is required.',
              retryable: false,
            })
          );
        }

        if (params.filePath) {
          const pathCheck = validateFilePath(params.filePath);
          if (!pathCheck.valid) {
            return toToolResult(
              fail({ code: 'restricted_path', message: pathCheck.error!, retryable: false })
            );
          }

          try {
            const buffer = await readFile(params.filePath);
            const blob = new Blob([buffer], { type: detectMimeType(params.filePath) });
            const formData = new FormData();
            formData.set('file', blob, basename(params.filePath));
            if (params.folder) {
              formData.set('folder', params.folder);
            }

            const result = await deps.httpClient.post('/media/upload', {
              formData,
            });
            return toToolResult(deps.normalizeOutcome(result));
          } catch (err: unknown) {
            const error = err as NodeJS.ErrnoException;
            if (error.code === 'ENOENT') {
              return toToolResult(
                fail({
                  code: 'file_not_found',
                  message: `File not found at path: ${params.filePath}`,
                  retryable: false,
                })
              );
            }
            if (error.code === 'EACCES') {
              return toToolResult(
                fail({
                  code: 'permission_denied',
                  message: `Permission denied: ${params.filePath}`,
                  retryable: false,
                })
              );
            }
            return toToolResult(
              fail({
                code: 'file_read_error',
                message: `Failed to read file: ${error.message}`,
                retryable: false,
              })
            );
          }
        }

        const result = await deps.httpClient.post('/media', {
          body: {
            mediaUrl: params.mediaUrl,
            folder: params.folder,
          },
        });
        return toToolResult(deps.normalizeOutcome(result));
      },
    },
    { names: [SENDIT_TOOL_NAMES.uploadMedia], optional: true }
  );

  // ── sendit_publish ───────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.publish,
      label: 'SendIt Publish',
      description:
        'Publish content immediately to one or more connected platforms. ' +
        'Requires at least one connected account. Returns per-platform publish status with post IDs and URLs. ' +
        'Call sendit_validate first to check content meets platform requirements. ' +
        'Related: Call sendit_validate first to check constraints. Use sendit_best_times before scheduling. Track results with sendit_analytics.',
      parameters: Type.Object({
        platforms: Type.Array(PLATFORM_TYPE, {
          minItems: 1,
          description: 'Target platforms to publish to.',
        }),
        content: CONTENT_SCHEMA,
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: { platforms: string[]; content: Record<string, unknown> }
      ) => {
        const result = await deps.httpClient.post('/publish', {
          body: params,
        });
        return toToolResult(deps.normalizeOutcome(result));
      },
    },
    { names: [SENDIT_TOOL_NAMES.publish], optional: true }
  );

  // ── sendit_schedule ──────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.schedule,
      label: 'SendIt Schedule',
      description:
        'Schedule content for a future publish time on one or more platforms. ' +
        'Returns a schedule ID that can be used with sendit_trigger_scheduled or sendit_delete_scheduled. ' +
        'Use sendit_best_times to find optimal posting windows. ' +
        'Related: Use sendit_best_times for optimal posting windows. Use sendit_list_scheduled to review the queue.',
      parameters: Type.Object({
        platforms: Type.Array(PLATFORM_TYPE, {
          minItems: 1,
          description: 'Target platforms to schedule for.',
        }),
        content: CONTENT_SCHEMA,
        scheduledTime: Type.String({
          description: "ISO 8601 datetime for when to publish (e.g., '2026-03-20T14:00:00Z').",
        }),
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: {
          platforms: string[];
          content: Record<string, unknown>;
          scheduledTime: string;
        }
      ) => {
        const result = await deps.httpClient.post('/schedule', {
          body: params,
        });
        return toToolResult(deps.normalizeOutcome(result));
      },
    },
    { names: [SENDIT_TOOL_NAMES.schedule], optional: true }
  );

  // ── sendit_list_scheduled ────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.listScheduled,
      label: 'SendIt List Scheduled',
      description:
        'List pending scheduled posts with their content, target platforms, and scheduled times. ' +
        'Optionally filter by platform. Use to review upcoming content before it publishes. ' +
        'Related: Use sendit_trigger_scheduled to publish immediately. Use sendit_delete_scheduled to cancel.',
      parameters: Type.Object({
        platform: Type.Optional(PLATFORM_TYPE),
        ...PAGINATION_PARAMS,
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: { platform?: string; limit?: number; offset?: number }
      ) => {
        const result = await deps.httpClient.get('/scheduled', {
          query: {
            platform: params.platform,
            limit: params.limit,
            offset: params.offset,
          },
        });
        return toToolResult(deps.normalizeOutcome(result));
      },
    },
    { names: [SENDIT_TOOL_NAMES.listScheduled] }
  );

  // ── sendit_trigger_scheduled ─────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.triggerScheduled,
      label: 'SendIt Trigger Scheduled',
      description:
        'Publish a scheduled post immediately instead of waiting for its scheduled time. ' +
        'The post is removed from the schedule queue after triggering. ' +
        'Related: Track results with sendit_analytics after triggering.',
      parameters: Type.Object({
        scheduleId: Type.String({ description: 'ID of the scheduled post to trigger.' }),
        ...TEAM_ID_PARAM,
      }),
      execute: async (_toolCallId: string, params: { scheduleId: string }) => {
        const result = await deps.httpClient.post(`/scheduled/${params.scheduleId}/trigger`);
        return toToolResult(deps.normalizeOutcome(result));
      },
    },
    { names: [SENDIT_TOOL_NAMES.triggerScheduled], optional: true }
  );

  // ── sendit_delete_scheduled ──────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.deleteScheduled,
      label: 'SendIt Delete Scheduled',
      description:
        'Cancel and delete a scheduled post. The post will not be published. ' +
        'Use sendit_list_scheduled to find the schedule ID. ' +
        'Related: Use sendit_list_scheduled to find schedule IDs.',
      parameters: Type.Object({
        scheduleId: Type.String({ description: 'ID of the scheduled post to cancel.' }),
        ...TEAM_ID_PARAM,
      }),
      execute: async (_toolCallId: string, params: { scheduleId: string }) => {
        const result = await deps.httpClient.delete(`/scheduled/${params.scheduleId}`);
        return toToolResult(deps.normalizeOutcome(result));
      },
    },
    { names: [SENDIT_TOOL_NAMES.deleteScheduled], optional: true }
  );

  // ── sendit_analytics ─────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.analytics,
      label: 'SendIt Analytics',
      description:
        'Fetch engagement analytics for a specific platform account, or omit platform for an aggregate view. ' +
        'For cross-platform analytics with trends, use sendit_unified_analytics instead. ' +
        'Related: Use sendit_best_times for posting optimization. Use sendit_content_score to improve content quality.',
      parameters: Type.Object({
        platform: Type.Optional(PLATFORM_TYPE),
        ...PAGINATION_PARAMS,
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: { platform?: string; limit?: number; offset?: number }
      ) => {
        const result = await deps.httpClient.get('/analytics', {
          query: {
            platform: params.platform,
            limit: params.limit,
            offset: params.offset,
          },
        });
        return toToolResult(deps.normalizeOutcome(result));
      },
    },
    { names: [SENDIT_TOOL_NAMES.analytics] }
  );

  // ── sendit_delete_post ───────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.deletePost,
      label: 'SendIt Delete Post',
      description:
        'Delete a published post from a platform. Deletion is permanent and cannot be undone. ' +
        'Not all platforms support post deletion — check sendit_capabilities first. ' +
        'Related: Use sendit_list_scheduled to manage unpublished posts instead.',
      parameters: Type.Object({
        platform: PLATFORM_TYPE,
        postId: Type.String({ description: 'Post ID or platform-specific post identifier.' }),
        ...TEAM_ID_PARAM,
      }),
      execute: async (_toolCallId: string, params: { platform: string; postId: string }) => {
        const result = await deps.httpClient.post('/posts/delete', {
          body: { platform: params.platform, postId: params.postId },
        });
        return toToolResult(deps.normalizeOutcome(result));
      },
    },
    { names: [SENDIT_TOOL_NAMES.deletePost], optional: true }
  );

  // ── sendit_preview ───────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.preview,
      label: 'SendIt Preview',
      description:
        'Render platform-specific content previews before publishing. ' +
        'Returns per-platform preview data with validation warnings. ' +
        'Related: Call sendit_validate for strict constraint checking. Use sendit_publish when ready.',
      parameters: Type.Object({
        platforms: Type.Array(PLATFORM_TYPE, {
          minItems: 1,
          description: 'Target platforms to preview.',
        }),
        content: CONTENT_SCHEMA,
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: { platforms: string[]; content: Record<string, unknown> }
      ) => {
        const result = await deps.httpClient.post('/preview', { body: params });
        return toToolResult(deps.normalizeOutcome(result));
      },
    },
    { names: [SENDIT_TOOL_NAMES.preview], optional: true }
  );

  // ── sendit_status ────────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.status,
      label: 'SendIt Status',
      description:
        'Diagnostic health check for the SendIt integration. Returns auth status, connected accounts, ' +
        'MCP availability, API tier, and feature flags. Call this first when troubleshooting issues. ' +
        "Related: Use sendit_capabilities for detailed feature discovery. Run 'openclaw sendit doctor' for CLI diagnostics.",
      parameters: Type.Object({}),
      execute: async () => {
        const catchUnreachable = (): {
          success: boolean;
          data?: unknown;
          error?: { code: string; message: string };
        } => ({
          success: false,
          error: { code: 'unreachable', message: 'Cannot reach SendIt API' },
        });

        const [capabilities, accounts] = await Promise.all([
          deps.httpClient.get('/capabilities').catch(catchUnreachable),
          deps.httpClient.get('/accounts').catch(catchUnreachable),
        ]);

        const accountData = accounts.data as Record<string, unknown> | undefined;
        const accountList =
          accounts.success && Array.isArray(accountData?.accounts)
            ? (accountData!.accounts as unknown[])
            : [];

        return toToolResult({
          success: true,
          data: {
            version: '0.1.0',
            auth: {
              mode: deps.authMode || 'unknown',
              valid: capabilities.success,
            },
            accounts: {
              count: accountList.length,
              connected: accounts.success,
            },
            mcp: {
              enabled: deps.mcpEnabled,
              available: deps.mcpClient !== null,
            },
            api: {
              reachable: capabilities.success,
              capabilities: capabilities.success ? capabilities.data : null,
            },
          },
        });
      },
    },
    { names: [SENDIT_TOOL_NAMES.status] }
  );

  // ── sendit_help ──────────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.help,
      label: 'SendIt Help',
      description:
        'Discover available SendIt tools and find the right one for your task. ' +
        "Pass a topic to search (e.g., 'campaign', 'analytics', 'inbox') or omit for full overview. " +
        'Returns matching tools with descriptions and available actions.',
      parameters: Type.Object({
        topic: Type.Optional(
          Type.String({
            description:
              "Topic or question to search (e.g., 'schedule', 'analytics', 'ad campaign'). Omit for full overview.",
          })
        ),
      }),
      execute: async (_toolCallId: string, params: { topic?: string }) => {
        const allTools = Object.entries(SENDIT_TOOL_NAMES);

        const groups = {
          core: allTools.filter(([k]) =>
            [
              'capabilities',
              'listAccounts',
              'connectAccount',
              'requirements',
              'validate',
              'uploadMedia',
              'publish',
              'schedule',
              'listScheduled',
              'triggerScheduled',
              'deleteScheduled',
              'deletePost',
              'preview',
              'analytics',
              'status',
              'help',
            ].includes(k)
          ),
          growth: allTools.filter(([k]) =>
            [
              'inbox',
              'listening',
              'campaigns',
              'brandVoice',
              'contentLibrary',
              'approvals',
              'deadLetter',
              'bulkSchedule',
              'webhooks',
              'auditLog',
              'aiMedia',
              'bestTimes',
              'contentScore',
            ].includes(k)
          ),
          advanced: allTools.filter(([k]) =>
            [
              'aiDraftReply',
              'aiSummarizeMentions',
              'aiGeneratePostBundle',
              'aiCritiquePost',
              'unifiedAnalytics',
              'anomalyAlerts',
              'benchmark',
              'ads',
              'crm',
              'agents',
              'workflows',
              'connectors',
            ].includes(k)
          ),
        };

        if (params.topic) {
          const query = params.topic.toLowerCase();
          const matches = allTools.filter(
            ([key, name]) =>
              key.toLowerCase().includes(query) ||
              name.toLowerCase().includes(query) ||
              name.replace(/_/g, ' ').toLowerCase().includes(query)
          );

          return toToolResult({
            success: true,
            data: {
              query: params.topic,
              matches: matches.map(([key, name]) => ({ key, tool: name })),
              matchCount: matches.length,
              hint: 'For detailed workflow guides, ensure the sendit-openclaw skill pack is installed.',
            },
          });
        }

        return toToolResult({
          success: true,
          data: {
            totalTools: allTools.length,
            groups: {
              core: { count: groups.core.length, tools: groups.core.map(([, name]) => name) },
              growth: { count: groups.growth.length, tools: groups.growth.map(([, name]) => name) },
              advanced: {
                count: groups.advanced.length,
                tools: groups.advanced.map(([, name]) => name),
              },
            },
            hint: 'For detailed workflow guides, ensure the sendit-openclaw skill pack is installed.',
          },
        });
      },
    },
    { names: [SENDIT_TOOL_NAMES.help], optional: true }
  );
}
