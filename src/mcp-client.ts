import {
  SENDIT_PLUGIN_ID,
  SENDIT_PLUGIN_VERSION,
  SENDIT_SKILL_PACK,
} from "./constants.js";
import { fail, ok, type SendItEnvelope } from "./result.js";

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}

interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code?: number | string;
    message?: string;
    data?: unknown;
  };
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

function isJsonRpcError(payload: JsonRpcResponse): payload is JsonRpcError {
  return "error" in payload;
}

function buildRpcId(): string {
  return `rpc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export class SendItMcpClient {
  private sessionId: string | null = null;

  constructor(
    private readonly endpoint: string,
    private readonly timeoutMs: number,
    private readonly getBearerToken: () => Promise<string | null>,
    private readonly includeTelemetryHeaders: boolean,
    private readonly retries: { max: number; backoffMs: number },
    private readonly logger: {
      debug?: (message: string) => void;
      info: (message: string) => void;
      warn: (message: string) => void;
      error: (message: string) => void;
    }
  ) {}

  private async rpcRequest<T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<SendItEnvelope<T>> {
    const payload = {
      jsonrpc: "2.0" as const,
      id: buildRpcId(),
      method,
      params,
    };

    let attempt = 0;
    const maxAttempts = this.retries.max + 1;

    while (attempt < maxAttempts) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const headers = new Headers({
          "Content-Type": "application/json",
          Accept: "application/json",
        });

        const token = await this.getBearerToken();
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }

        if (this.sessionId) {
          headers.set("mcp-session-id", this.sessionId);
        }

        if (this.includeTelemetryHeaders) {
          headers.set("X-SendIt-Integration", SENDIT_PLUGIN_ID);
          headers.set("X-SendIt-Integration-Version", SENDIT_PLUGIN_VERSION);
          headers.set("X-SendIt-Skill-Pack", SENDIT_SKILL_PACK);
        }

        const response = await fetch(this.endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        const nextSessionId = response.headers.get("mcp-session-id");
        if (nextSessionId) {
          this.sessionId = nextSessionId;
        }

        const body = (await response.json()) as JsonRpcResponse;

        if (!response.ok) {
          const message = isJsonRpcError(body)
            ? body.error?.message || `MCP request failed with status ${response.status}`
            : `MCP request failed with status ${response.status}`;

          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt + 1 < maxAttempts) {
            attempt += 1;
            await new Promise((resolve) =>
              setTimeout(resolve, this.retries.backoffMs * attempt)
            );
            continue;
          }

          return fail({
            code: `mcp_http_${response.status}`,
            message,
            retryable,
            status: response.status,
          });
        }

        if (isJsonRpcError(body)) {
          return fail({
            code: typeof body.error.code === "number" ? `mcp_${body.error.code}` : "mcp_error",
            message: body.error.message || "MCP error",
            retryable: false,
          });
        }

        return ok(body.result as T);
      } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";
        if (attempt + 1 < maxAttempts) {
          attempt += 1;
          await new Promise((resolve) =>
            setTimeout(resolve, this.retries.backoffMs * attempt)
          );
          continue;
        }

        return fail({
          code: isAbort ? "mcp_timeout" : "mcp_network_error",
          message: error instanceof Error ? error.message : "MCP request failed",
          retryable: true,
        });
      } finally {
        clearTimeout(timeout);
      }
    }

    return fail({
      code: "mcp_request_failed",
      message: "MCP request failed after retries",
      retryable: true,
    });
  }

  async initialize(): Promise<SendItEnvelope<Record<string, unknown>>> {
    const result = await this.rpcRequest<Record<string, unknown>>("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "@sendit/openclaw",
        version: SENDIT_PLUGIN_VERSION,
      },
    });

    if (!result.success) {
      return result;
    }

    // One-shot notification per MCP lifecycle.
    await this.rpcRequest("notifications/initialized", {});
    return result;
  }

  async listTools(): Promise<SendItEnvelope<{ tools: Array<{ name: string }> }>> {
    return this.rpcRequest<{ tools: Array<{ name: string }> }>("tools/list", {});
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<SendItEnvelope<unknown>> {
    return this.rpcRequest<unknown>("tools/call", { name, arguments: args });
  }
}
