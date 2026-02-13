import type { OpenClawConfig } from "./openclaw-types.js";

export type SendItAuthMode = "auto" | "api_key" | "oauth";

export interface SendItOAuthConfig {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  clientId?: string;
  clientSecret?: string;
}

export interface SendItPluginConfig {
  enabled: boolean;
  baseUrl: string;
  auth: {
    mode: SendItAuthMode;
    apiKey?: string;
    oauth?: SendItOAuthConfig;
  };
  teamId?: string;
  timeouts: {
    requestMs: number;
    mcpMs: number;
  };
  retries: {
    max: number;
    backoffMs: number;
  };
  mcp: {
    enabled: boolean;
    endpoint: string;
  };
  telemetry: {
    enabled: boolean;
  };
}

const DEFAULT_BASE_URL = "https://sendit.infiniteappsai.com";
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_MCP_TIMEOUT_MS = 25_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 500;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === "boolean") return value;
  return defaultValue;
}

function asNumber(value: unknown, defaultValue: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return defaultValue;
}

function normalizeBaseUrl(rawBaseUrl: string | undefined): string {
  const value = rawBaseUrl || DEFAULT_BASE_URL;
  return value.replace(/\/+$/, "");
}

export function resolveSendItPluginConfig(
  rawPluginConfig: unknown,
  openclawConfig?: OpenClawConfig
): SendItPluginConfig {
  const input = asRecord(rawPluginConfig);
  const auth = asRecord(input.auth);
  const oauth = asRecord(auth.oauth);
  const timeouts = asRecord(input.timeouts);
  const retries = asRecord(input.retries);
  const mcp = asRecord(input.mcp);
  const telemetry = asRecord(input.telemetry);

  const envApiKey =
    process.env.SENDIT_API_KEY?.trim() ||
    process.env.OPENCLAW_SENDIT_API_KEY?.trim() ||
    process.env.OPENCLAW_SENDIT_TOKEN?.trim();

  const modelsProvider = asRecord(asRecord(openclawConfig?.models?.providers).sendit);
  const modelApiKey = asString(modelsProvider.apiKey);

  const baseUrl = normalizeBaseUrl(
    asString(input.baseUrl) ||
      asString(process.env.SENDIT_BASE_URL) ||
      asString(modelsProvider.baseUrl)
  );

  const modeRaw = asString(auth.mode);
  const mode: SendItAuthMode =
    modeRaw === "api_key" || modeRaw === "oauth" || modeRaw === "auto" ? modeRaw : "auto";

  const apiKey = asString(auth.apiKey) || envApiKey || modelApiKey;

  const oauthConfig: SendItOAuthConfig = {
    accessToken: asString(oauth.accessToken),
    refreshToken: asString(oauth.refreshToken),
    expiresAt:
      typeof oauth.expiresAt === "number" && Number.isFinite(oauth.expiresAt)
        ? oauth.expiresAt
        : undefined,
    clientId: asString(oauth.clientId),
    clientSecret: asString(oauth.clientSecret),
  };

  const hasOAuth = Boolean(oauthConfig.accessToken || oauthConfig.refreshToken);

  return {
    enabled: asBoolean(input.enabled, true),
    baseUrl,
    auth: {
      mode,
      apiKey,
      oauth: hasOAuth ? oauthConfig : undefined,
    },
    teamId: asString(input.teamId),
    timeouts: {
      requestMs: Math.max(1_000, asNumber(timeouts.requestMs, DEFAULT_REQUEST_TIMEOUT_MS)),
      mcpMs: Math.max(1_000, asNumber(timeouts.mcpMs, DEFAULT_MCP_TIMEOUT_MS)),
    },
    retries: {
      max: Math.max(0, Math.min(5, Math.floor(asNumber(retries.max, DEFAULT_RETRIES)))),
      backoffMs: Math.max(100, asNumber(retries.backoffMs, DEFAULT_BACKOFF_MS)),
    },
    mcp: {
      enabled: asBoolean(mcp.enabled, true),
      endpoint: asString(mcp.endpoint) || `${baseUrl}/api/mcp`,
    },
    telemetry: {
      enabled: asBoolean(telemetry.enabled, true),
    },
  };
}

export function resolveApiBaseUrl(config: SendItPluginConfig): string {
  return `${config.baseUrl}/api/v1`;
}

export function resolveOAuthEndpoints(config: SendItPluginConfig): {
  register: string;
  authorize: string;
  token: string;
} {
  return {
    register: `${config.baseUrl}/api/oauth/register`,
    authorize: `${config.baseUrl}/api/oauth/authorize`,
    token: `${config.baseUrl}/api/oauth/token`,
  };
}
