import { basename, extname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { Type } from '@sinclair/typebox';
import { SENDIT_PLATFORM_ENUM } from '../constants.js';
import { fail, toToolResult, type SendItEnvelope } from '../result.js';
import { t, createTranslator } from '../i18n.js';
import type { SendItHttpClient } from '../http-client.js';
import type { SendItMcpClient } from '../mcp-client.js';

// ── Shared Typebox schemas ──────────────────────────────────────────

export const PLATFORM_TYPE = Type.Union(
  SENDIT_PLATFORM_ENUM.map((platform) => Type.Literal(platform))
);

export const CONTENT_SCHEMA = Type.Object({
  text: Type.String({ description: 'Post body text.' }),
  mediaUrl: Type.Optional(Type.String({ description: 'URL of a single media attachment.' })),
  mediaUrls: Type.Optional(
    Type.Array(Type.String(), {
      description: 'URLs of multiple media attachments (carousel, gallery).',
    })
  ),
  mediaType: Type.Optional(
    Type.Union([Type.Literal('image'), Type.Literal('video'), Type.Literal('auto')], {
      description: 'Hint for media type detection (default: auto).',
    })
  ),
  title: Type.Optional(
    Type.String({
      description: 'Title for platforms that support it (YouTube, blog posts).',
    })
  ),
  firstComment: Type.Optional(
    Type.String({
      description: 'First comment posted immediately after publishing (Instagram, LinkedIn).',
    })
  ),
  linkUrl: Type.Optional(
    Type.String({
      description: 'Link preview URL for platforms that support link cards.',
    })
  ),
});

export const PAGINATION_PARAMS = {
  limit: Type.Optional(
    Type.Number({ description: 'Maximum items to return (default: 20, max: 100).' })
  ),
  offset: Type.Optional(Type.Number({ description: 'Number of items to skip for pagination.' })),
};

export const TEAM_ID_PARAM = {
  teamId: Type.Optional(Type.String({ description: 'Override team context for this call.' })),
};

// ── Normalized outcome type ─────────────────────────────────────────

export interface NormalizedResult {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string; retryable?: boolean; status?: number };
}

// ── normalizeOutcome factory ────────────────────────────────────────

export function createNormalizeOutcome(
  authMode?: string,
  locale?: string
): (outcome: SendItEnvelope<unknown>) => NormalizedResult {
  const tr = createTranslator(locale || 'en');

  return (outcome: SendItEnvelope<unknown>): NormalizedResult => {
    if (outcome.success) {
      return { success: true, data: outcome.data };
    }

    const raw = outcome.error;
    let message = raw?.message || 'Operation failed';
    let retryable = raw?.retryable;

    // Enrich common HTTP error codes with actionable i18n guidance
    if (raw?.status === 401) {
      const key =
        authMode === 'oauth' ? 'errors.unauthorized_oauth' : 'errors.unauthorized_api_key';
      message += ' ' + tr(key);
    } else if (raw?.status === 403) {
      message += ' ' + tr('errors.forbidden');
    } else if (raw?.status === 404) {
      message += ' ' + tr('errors.not_found');
    } else if (raw?.status === 429) {
      message += ' ' + tr('errors.rate_limited');
      retryable = true;
    } else if (raw?.status === 500) {
      message += ' ' + tr('errors.server_error');
      retryable = true;
    } else if (raw?.status === 502 || raw?.status === 503) {
      message += ' ' + tr('errors.service_unavailable');
      retryable = true;
    }

    return {
      success: false,
      error: {
        code: raw?.code || 'unknown_error',
        message,
        retryable,
        status: raw?.status,
      },
    };
  };
}

// Backward-compatible default (no auth mode)
export function normalizeOutcome(outcome: SendItEnvelope<unknown>): NormalizedResult {
  return createNormalizeOutcome()(outcome);
}

export function normalizeMcpCallResult(result: unknown): SendItEnvelope<unknown> {
  if (!result || typeof result !== 'object') {
    return { success: true, data: result };
  }

  const record = result as Record<string, unknown>;

  if (record.envelope && typeof record.envelope === 'object') {
    const envelope = record.envelope as Record<string, unknown>;
    if (envelope.success === false) {
      const error =
        envelope.error && typeof envelope.error === 'object'
          ? (envelope.error as Record<string, unknown>)
          : {};

      return {
        success: false,
        error: {
          code: typeof error.code === 'string' ? error.code : 'mcp_tool_error',
          message: typeof error.message === 'string' ? error.message : 'MCP tool call failed',
          retryable: typeof error.retryable === 'boolean' ? error.retryable : undefined,
        },
      };
    }

    return {
      success: true,
      data: envelope.data ?? record,
    };
  }

  if (record.isError === true) {
    const content = Array.isArray(record.content)
      ? (record.content as Array<Record<string, unknown>>)
      : [];
    const text =
      typeof content[0]?.text === 'string' ? content[0].text : 'MCP tool returned an error';

    return fail({
      code: 'mcp_tool_error',
      message: text,
      retryable: false,
    });
  }

  return {
    success: true,
    data: record,
  };
}

// ── dispatchMcpAction helper ────────────────────────────────────────
//
//  Replaces the repeated 7-line dispatch pattern in advanced tools.
//  Maps an action string to an MCP tool name, validates, calls, and
//  normalizes the result.

export async function dispatchMcpAction(
  deps: ToolRuntimeDeps,
  params: { action: string; [key: string]: unknown },
  mcpToolMap: Record<string, string>,
  toolLabel: string
): Promise<{ content: Array<{ type: 'text'; text: string }>; details: unknown }> {
  const mcpTool = mcpToolMap[params.action];
  if (!mcpTool) {
    return toToolResult(
      fail({
        code: 'invalid_action',
        message: `Unsupported ${toolLabel} action: ${params.action}`,
        retryable: false,
      })
    );
  }
  // Strip transport-layer fields that are plugin concerns, not MCP tool arguments
  const { action, teamId, ...rest } = params;
  const outcome = await deps.callMcpTool(mcpTool, rest);
  return toToolResult(deps.normalizeOutcome(outcome));
}

// ── MIME type detection ─────────────────────────────────────────────

export function detectMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.avif':
      return 'image/avif';
    case '.heic':
      return 'image/heic';
    case '.heif':
      return 'image/heif';
    case '.bmp':
      return 'image/bmp';
    case '.tiff':
    case '.tif':
      return 'image/tiff';
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.avi':
      return 'video/x-msvideo';
    case '.mkv':
      return 'video/x-matroska';
    default:
      return 'application/octet-stream';
  }
}

// ── File path validation ────────────────────────────────────────────

// Include /private/ variants for macOS where /etc -> /private/etc
const BLOCKED_PREFIXES = ['/etc/', '/proc/', '/sys/', '/dev/', '/private/etc/', '/private/var/db/'];
const BLOCKED_HOME_DOTS = ['.ssh', '.gnupg', '.aws', '.config/gcloud', '.kube'];

export function validateFilePath(filePath: string): { valid: boolean; error?: string } {
  const resolved = resolve(filePath);

  if (filePath.includes('..')) {
    return { valid: false, error: `Path contains traversal segments: ${filePath}` };
  }

  for (const prefix of BLOCKED_PREFIXES) {
    if (resolved.startsWith(prefix) || resolved === prefix.slice(0, -1)) {
      return { valid: false, error: `Path is in a restricted system directory: ${resolved}` };
    }
  }

  const home = homedir();
  for (const dot of BLOCKED_HOME_DOTS) {
    if (resolved.startsWith(`${home}/${dot}`)) {
      return { valid: false, error: `Path is in a restricted home directory: ${resolved}` };
    }
  }

  return { valid: true };
}

export { basename };
export { fail, toToolResult };
export type { SendItEnvelope, SendItHttpClient, SendItMcpClient };

// ── Shared interfaces ───────────────────────────────────────────────

export interface ToolRuntimeDeps {
  httpClient: SendItHttpClient;
  mcpClient: SendItMcpClient | null;
  mcpEnabled: boolean;
  authMode?: string;
  locale?: string;
  callMcpTool: (
    toolName: string,
    args: Record<string, unknown>
  ) => Promise<SendItEnvelope<unknown>>;
  normalizeOutcome: (outcome: SendItEnvelope<unknown>) => NormalizedResult;
  logger: {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
}

export type { OpenClawPluginApi } from '../openclaw-types.js';
