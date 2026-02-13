import { resolveApiBaseUrl, type SendItPluginConfig, type SendItOAuthConfig } from "./config.js";
import {
  SENDIT_PLUGIN_ID,
  SENDIT_PLUGIN_VERSION,
  SENDIT_SKILL_PACK,
} from "./constants.js";
import { fail, isRetryableStatus, ok, type SendItEnvelope } from "./result.js";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface SendItRequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  formData?: FormData;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  timeoutMs?: number;
}

export type SendItOAuthRefresher = (
  oauth: SendItOAuthConfig
) => Promise<SendItOAuthConfig | null>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;

  if (typeof record.error === "string") return record.error;
  if (record.error && typeof record.error === "object") {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
    if (typeof nested.error_description === "string") return nested.error_description;
  }

  if (typeof record.message === "string") return record.message;
  if (typeof record.error_description === "string") return record.error_description;

  return fallback;
}

function encodeQuery(query: Record<string, unknown> | undefined): string {
  if (!query) return "";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          params.append(key, String(item));
        }
      }
      continue;
    }
    params.set(key, String(value));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export class SendItHttpClient {
  private readonly apiBaseUrl: string;
  private oauthRefresher?: SendItOAuthRefresher;

  constructor(
    private readonly config: SendItPluginConfig,
    private readonly logger: {
      debug?: (message: string) => void;
      info: (message: string) => void;
      warn: (message: string) => void;
      error: (message: string) => void;
    }
  ) {
    this.apiBaseUrl = resolveApiBaseUrl(config);
  }

  setOAuthRefresher(refresher: SendItOAuthRefresher): void {
    this.oauthRefresher = refresher;
  }

  private async resolveBearerToken(): Promise<string | null> {
    const mode = this.config.auth.mode;

    if (mode === "api_key") {
      return this.config.auth.apiKey || null;
    }

    if (mode === "oauth") {
      return this.resolveOAuthAccessToken();
    }

    // auto mode: prefer API key, then OAuth
    if (this.config.auth.apiKey) {
      return this.config.auth.apiKey;
    }

    return this.resolveOAuthAccessToken();
  }

  private async resolveOAuthAccessToken(): Promise<string | null> {
    const oauth = this.config.auth.oauth;
    if (!oauth?.accessToken) return null;

    const expiresAt = oauth.expiresAt || 0;
    const shouldRefresh = expiresAt > 0 && Date.now() > expiresAt - 60_000;

    if (!shouldRefresh || !this.oauthRefresher) {
      return oauth.accessToken;
    }

    const refreshed = await this.oauthRefresher(oauth);
    if (!refreshed?.accessToken) {
      return oauth.accessToken;
    }

    this.config.auth.oauth = refreshed;
    return refreshed.accessToken;
  }

  private buildRequestUrl(path: string, query?: Record<string, unknown>): string {
    const base = path.startsWith("http://") || path.startsWith("https://")
      ? path
      : `${this.apiBaseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

    return `${base}${encodeQuery(query)}`;
  }

  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    options: SendItRequestOptions = {}
  ): Promise<SendItEnvelope<T>> {
    const url = this.buildRequestUrl(path, options.query);

    let attempt = 0;
    const maxAttempts = this.config.retries.max + 1;

    while (attempt < maxAttempts) {
      const timeoutMs = options.timeoutMs || this.config.timeouts.requestMs;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const headers = new Headers(options.headers || {});
        headers.set("Accept", "application/json");

        const token = await this.resolveBearerToken();
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }

        if (this.config.teamId) {
          headers.set("X-Team-ID", this.config.teamId);
        }

        if (this.config.telemetry.enabled) {
          headers.set("X-SendIt-Integration", SENDIT_PLUGIN_ID);
          headers.set("X-SendIt-Integration-Version", SENDIT_PLUGIN_VERSION);
          headers.set("X-SendIt-Skill-Pack", SENDIT_SKILL_PACK);
        }

        if (options.idempotencyKey) {
          headers.set("Idempotency-Key", options.idempotencyKey);
        }

        let body: BodyInit | undefined;
        if (options.formData) {
          body = options.formData;
        } else if (options.body !== undefined) {
          headers.set("Content-Type", "application/json");
          body = JSON.stringify(options.body);
        }

        const response = await fetch(url, {
          method,
          headers,
          body,
          signal: controller.signal,
        });

        const contentType = response.headers.get("content-type") || "";
        const parsedPayload = contentType.includes("application/json")
          ? ((await response.json()) as unknown)
          : ((await response.text()) as unknown);

        if (response.ok) {
          return ok(parsedPayload as T);
        }

        const retryable = isRetryableStatus(response.status);
        if (retryable && attempt + 1 < maxAttempts) {
          attempt += 1;
          await sleep(this.config.retries.backoffMs * attempt);
          continue;
        }

        return fail({
          code: `http_${response.status}`,
          message: toErrorMessage(parsedPayload, `HTTP ${response.status}`),
          retryable,
          status: response.status,
        });
      } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";
        const retryable = true;

        if (attempt + 1 < maxAttempts) {
          attempt += 1;
          await sleep(this.config.retries.backoffMs * attempt);
          continue;
        }

        return fail({
          code: isAbort ? "timeout" : "network_error",
          message: error instanceof Error ? error.message : "Network request failed",
          retryable,
        });
      } finally {
        clearTimeout(timeout);
      }
    }

    return fail({
      code: "request_failed",
      message: "Request failed after retries",
      retryable: true,
    });
  }

  async get<T = unknown>(path: string, options: SendItRequestOptions = {}): Promise<SendItEnvelope<T>> {
    return this.request<T>("GET", path, options);
  }

  async post<T = unknown>(path: string, options: SendItRequestOptions = {}): Promise<SendItEnvelope<T>> {
    return this.request<T>("POST", path, options);
  }

  async patch<T = unknown>(path: string, options: SendItRequestOptions = {}): Promise<SendItEnvelope<T>> {
    return this.request<T>("PATCH", path, options);
  }

  async delete<T = unknown>(path: string, options: SendItRequestOptions = {}): Promise<SendItEnvelope<T>> {
    return this.request<T>("DELETE", path, options);
  }
}
