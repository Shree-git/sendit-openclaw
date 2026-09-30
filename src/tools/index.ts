import { AsyncLocalStorage } from 'node:async_hooks';
import type { OpenClawPluginApi } from '../openclaw-types.js';
import type { SendItHttpClient } from '../http-client.js';
import type { SendItMcpClient } from '../mcp-client.js';
import { fail, type SendItEnvelope } from '../result.js';
import { normalizeMcpCallResult, createNormalizeOutcome } from './shared.js';
import { registerCoreTools } from './core.js';
import { registerGrowthTools } from './growth.js';
import { registerAdvancedTools } from './advanced.js';

// Per-call httpClient override for team switching (concurrency-safe)
const httpClientOverride = new AsyncLocalStorage<SendItHttpClient>();

interface ToolRuntimeOptions {
  httpClient: SendItHttpClient;
  mcpClient: SendItMcpClient | null;
  mcpEnabled: boolean;
  authMode?: string;
  locale?: string;
  logger: {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
}

export class SendItToolRuntime {
  private mcpInitialized = false;
  private mcpAvailableTools = new Set<string>();
  private mcpToolSchemas = new Map<string, object>();
  private capabilityProbe: Promise<void> | undefined;

  constructor(private readonly options: ToolRuntimeOptions) {}

  probeCapabilities(): Promise<void> {
    this.capabilityProbe ??= this.performCapabilityProbe();
    return this.capabilityProbe;
  }

  private async performCapabilityProbe(): Promise<void> {
    const capabilities = await this.options.httpClient.get('/capabilities');
    if (!capabilities.success) {
      this.options.logger.warn(
        `[sendit] Capabilities probe failed: ${capabilities.error?.message || 'unknown error'}`
      );
    }

    if (!this.options.mcpEnabled || !this.options.mcpClient) {
      return;
    }

    const init = await this.options.mcpClient.initialize();
    if (!init.success) {
      this.options.logger.warn(
        `[sendit] MCP initialize failed: ${init.error?.message || 'unknown error'}`
      );
      return;
    }

    this.mcpInitialized = true;

    const tools = await this.options.mcpClient.listTools();
    if (!tools.success) {
      this.options.logger.warn(
        `[sendit] MCP tools/list failed: ${tools.error?.message || 'unknown error'}`
      );
      return;
    }

    const toolList = Array.isArray(tools.data?.tools) ? tools.data.tools : [];
    for (const entry of toolList) {
      if (entry && typeof entry.name === 'string') {
        this.mcpAvailableTools.add(entry.name);
        // Store full tool schema for auto-discovery validation
        const record = entry as Record<string, unknown>;
        if (record.inputSchema && typeof record.inputSchema === 'object') {
          this.mcpToolSchemas.set(entry.name, record.inputSchema as object);
        }
      }
    }

    this.options.logger.info(
      `[sendit] MCP probe complete (${this.mcpAvailableTools.size} tools, ${this.mcpToolSchemas.size} schemas discovered)`
    );
  }

  private validateAgainstDiscoveredSchema(toolName: string, args: Record<string, unknown>): void {
    const schema = this.mcpToolSchemas.get(toolName);
    if (!schema || typeof schema !== 'object') return;

    const schemaRecord = schema as Record<string, unknown>;
    const properties = schemaRecord.properties as Record<string, unknown> | undefined;
    if (!properties) return;

    const serverFields = new Set(Object.keys(properties));
    const clientFields = Object.keys(args);

    // Warn about fields the client sends that the server doesn't expect
    for (const field of clientFields) {
      if (!serverFields.has(field) && args[field] !== undefined) {
        this.options.logger.warn(
          `[sendit] Schema drift: field '${field}' sent to MCP tool '${toolName}' but not in server schema`
        );
      }
    }

    // Warn about required fields the client doesn't send
    const required = Array.isArray(schemaRecord.required)
      ? (schemaRecord.required as string[])
      : [];
    for (const field of required) {
      if (args[field] === undefined) {
        this.options.logger.warn(
          `[sendit] Schema drift: required field '${field}' missing for MCP tool '${toolName}'`
        );
      }
    }
  }

  private async callMcpTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<SendItEnvelope<unknown>> {
    if (!this.options.mcpEnabled || !this.options.mcpClient) {
      return fail({
        code: 'mcp_disabled',
        message: 'MCP bridge is disabled in plugin config (mcp.enabled=false).',
        retryable: false,
      });
    }

    await this.probeCapabilities();

    if (!this.mcpInitialized) {
      const init = await this.options.mcpClient.initialize();
      if (!init.success) {
        return init;
      }
      this.mcpInitialized = true;
    }

    if (this.mcpAvailableTools.size > 0 && !this.mcpAvailableTools.has(toolName)) {
      return fail({
        code: 'mcp_tool_unavailable',
        message:
          `MCP tool '${toolName}' is unavailable. It may be disabled by SendIt GA/beta gating. ` +
          'Use sendit_capabilities to verify active tools.',
        retryable: false,
      });
    }

    // Auto-schema discovery: validate args against server schema
    this.validateAgainstDiscoveredSchema(toolName, args);

    const result = await this.options.mcpClient.callTool(toolName, args);
    if (!result.success) {
      return result;
    }

    return normalizeMcpCallResult(result.data);
  }

  registerTools(api: OpenClawPluginApi): void {
    const boundNormalizeOutcome = createNormalizeOutcome(
      this.options.authMode,
      this.options.locale
    );

    const baseDeps = {
      httpClient: this.options.httpClient,
      mcpClient: this.options.mcpClient,
      mcpEnabled: this.options.mcpEnabled,
      authMode: this.options.authMode,
      locale: this.options.locale,
      callMcpTool: this.callMcpTool.bind(this),
      normalizeOutcome: boundNormalizeOutcome,
      logger: this.options.logger,
    };

    // Proxy deps so httpClient reads from AsyncLocalStorage when a
    // per-call team override is active (concurrency-safe)
    const deps = new Proxy(baseDeps, {
      get(target, prop, receiver) {
        if (prop === 'httpClient') {
          return httpClientOverride.getStore() ?? target.httpClient;
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    // Wrap registerTool to add tool-call logging and teamId extraction
    const originalRegisterTool = api.registerTool.bind(api);
    const baseHttpClient = this.options.httpClient;
    const loggingApi: OpenClawPluginApi = {
      ...api,
      registerTool: (tool: unknown, opts?: { names?: string[]; optional?: boolean }) => {
        const t = tool as {
          name: string;
          execute: (toolCallId: string, params: unknown) => Promise<unknown>;
          [key: string]: unknown;
        };
        const originalExecute = t.execute;
        const wrappedTool = {
          ...t,
          execute: async (toolCallId: string, params: unknown) => {
            const p = (params && typeof params === 'object' ? params : {}) as Record<
              string,
              unknown
            >;
            const action = p.action;
            this.options.logger.info(
              `[sendit] ${t.name}${action ? ` action=${action}` : ''}${p.teamId ? ` team=${p.teamId}` : ''}`
            );

            // Per-call team override via AsyncLocalStorage (concurrency-safe).
            // The deps Proxy reads httpClient from the store when set.
            if (typeof p.teamId === 'string' && p.teamId) {
              const teamClient = baseHttpClient.withTeam(p.teamId);
              return httpClientOverride.run(teamClient, () => originalExecute(toolCallId, params));
            }

            return originalExecute(toolCallId, params);
          },
        };
        return originalRegisterTool(wrappedTool, opts);
      },
    };

    registerCoreTools(loggingApi, deps);
    registerGrowthTools(loggingApi, deps);
    registerAdvancedTools(loggingApi, deps);
  }
}
