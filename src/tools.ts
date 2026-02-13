import { basename, extname } from "node:path";
import { readFile } from "node:fs/promises";
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "./openclaw-types.js";
import { SENDIT_PLATFORM_ENUM, SENDIT_TOOL_NAMES } from "./constants.js";
import type { SendItHttpClient } from "./http-client.js";
import type { SendItMcpClient } from "./mcp-client.js";
import { fail, toToolResult, type SendItEnvelope } from "./result.js";

const PLATFORM_TYPE = Type.Union(
  SENDIT_PLATFORM_ENUM.map((platform) => Type.Literal(platform))
);

function normalizeOutcome(outcome: SendItEnvelope<unknown>): {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string; retryable?: boolean; status?: number };
} {
  if (outcome.success) {
    return { success: true, data: outcome.data };
  }

  return {
    success: false,
    error: {
      code: outcome.error?.code || "unknown_error",
      message: outcome.error?.message || "Operation failed",
      retryable: outcome.error?.retryable,
      status: outcome.error?.status,
    },
  };
}

function detectMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    default:
      return "application/octet-stream";
  }
}

function normalizeMcpCallResult(result: unknown): SendItEnvelope<unknown> {
  if (!result || typeof result !== "object") {
    return { success: true, data: result };
  }

  const record = result as Record<string, unknown>;

  if (record.envelope && typeof record.envelope === "object") {
    const envelope = record.envelope as Record<string, unknown>;
    if (envelope.success === false) {
      const error =
        envelope.error && typeof envelope.error === "object"
          ? (envelope.error as Record<string, unknown>)
          : {};

      return {
        success: false,
        error: {
          code: typeof error.code === "string" ? error.code : "mcp_tool_error",
          message:
            typeof error.message === "string"
              ? error.message
              : "MCP tool call failed",
          retryable: typeof error.retryable === "boolean" ? error.retryable : undefined,
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
      typeof content[0]?.text === "string"
        ? content[0].text
        : "MCP tool returned an error";

    return fail({
      code: "mcp_tool_error",
      message: text,
      retryable: false,
    });
  }

  return {
    success: true,
    data: record,
  };
}

interface ToolRuntimeOptions {
  httpClient: SendItHttpClient;
  mcpClient: SendItMcpClient | null;
  mcpEnabled: boolean;
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

  constructor(private readonly options: ToolRuntimeOptions) {}

  async probeCapabilities(): Promise<void> {
    const capabilities = await this.options.httpClient.get("/capabilities");
    if (!capabilities.success) {
      this.options.logger.warn(
        `[sendit] Capabilities probe failed: ${capabilities.error?.message || "unknown error"}`
      );
    }

    if (!this.options.mcpEnabled || !this.options.mcpClient) {
      return;
    }

    const init = await this.options.mcpClient.initialize();
    if (!init.success) {
      this.options.logger.warn(
        `[sendit] MCP initialize failed: ${init.error?.message || "unknown error"}`
      );
      return;
    }

    this.mcpInitialized = true;

    const tools = await this.options.mcpClient.listTools();
    if (!tools.success) {
      this.options.logger.warn(
        `[sendit] MCP tools/list failed: ${tools.error?.message || "unknown error"}`
      );
      return;
    }

    const toolList = Array.isArray(tools.data?.tools) ? tools.data.tools : [];
    for (const entry of toolList) {
      if (entry && typeof entry.name === "string") {
        this.mcpAvailableTools.add(entry.name);
      }
    }

    this.options.logger.info(
      `[sendit] MCP probe complete (${this.mcpAvailableTools.size} tools discovered)`
    );
  }

  private async callMcpTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<SendItEnvelope<unknown>> {
    if (!this.options.mcpEnabled || !this.options.mcpClient) {
      return fail({
        code: "mcp_disabled",
        message: "MCP bridge is disabled in plugin config (mcp.enabled=false).",
        retryable: false,
      });
    }

    if (!this.mcpInitialized) {
      const init = await this.options.mcpClient.initialize();
      if (!init.success) {
        return init;
      }
      this.mcpInitialized = true;
    }

    if (this.mcpAvailableTools.size > 0 && !this.mcpAvailableTools.has(toolName)) {
      return fail({
        code: "mcp_tool_unavailable",
        message:
          `MCP tool '${toolName}' is unavailable. It may be disabled by SendIt GA/beta gating. ` +
          "Use sendit_capabilities to verify active tools.",
        retryable: false,
      });
    }

    const result = await this.options.mcpClient.callTool(toolName, args);
    if (!result.success) {
      return result;
    }

    return normalizeMcpCallResult(result.data);
  }

  registerTools(api: OpenClawPluginApi): void {
    this.registerCoreTools(api);
    this.registerGrowthTools(api);
    this.registerAdvancedTools(api);
  }

  private registerCoreTools(api: OpenClawPluginApi): void {
    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.capabilities,
        label: "SendIt Capabilities",
        description: "Get SendIt tool/platform capabilities with GA/beta metadata.",
        parameters: Type.Object({
          include_beta: Type.Optional(Type.Boolean()),
        }),
        execute: async (_toolCallId: string, params: { include_beta?: boolean }) => {
          const result = await this.options.httpClient.get("/capabilities", {
            query: {
              include_beta:
                typeof params.include_beta === "boolean" ? params.include_beta : undefined,
            },
          });
          return toToolResult(normalizeOutcome(result));
        },
      },
      { names: [SENDIT_TOOL_NAMES.capabilities] }
    );

    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.listAccounts,
        label: "SendIt List Accounts",
        description: "List connected SendIt social accounts.",
        parameters: Type.Object({}),
        execute: async () => {
          const result = await this.options.httpClient.get("/accounts");
          return toToolResult(normalizeOutcome(result));
        },
      },
      { names: [SENDIT_TOOL_NAMES.listAccounts] }
    );

    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.connectAccount,
        label: "SendIt Connect Account",
        description: "Get OAuth connect URL for a specific social platform.",
        parameters: Type.Object({
          platform: PLATFORM_TYPE,
        }),
        execute: async (_toolCallId: string, params: { platform: string }) => {
          const result = await this.options.httpClient.get(
            `/connect/${params.platform}`
          );
          return toToolResult(normalizeOutcome(result));
        },
      },
      { names: [SENDIT_TOOL_NAMES.connectAccount], optional: true }
    );

    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.requirements,
        label: "SendIt Requirements",
        description: "Get platform-specific content requirements.",
        parameters: Type.Object({
          platform: PLATFORM_TYPE,
        }),
        execute: async (_toolCallId: string, params: { platform: string }) => {
          const result = await this.options.httpClient.get("/requirements", {
            query: { platform: params.platform },
          });
          return toToolResult(normalizeOutcome(result));
        },
      },
      { names: [SENDIT_TOOL_NAMES.requirements] }
    );

    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.validate,
        label: "SendIt Validate Content",
        description: "Validate content against platform constraints before publish/schedule.",
        parameters: Type.Object({
          platforms: Type.Array(PLATFORM_TYPE, { minItems: 1 }),
          content: Type.Object(
            {
              text: Type.String(),
              mediaUrl: Type.Optional(Type.String()),
              mediaUrls: Type.Optional(Type.Array(Type.String())),
              mediaType: Type.Optional(
                Type.Union([
                  Type.Literal("image"),
                  Type.Literal("video"),
                  Type.Literal("auto"),
                ])
              ),
            },
            { additionalProperties: true }
          ),
        }),
        execute: async (_toolCallId: string, params: { platforms: string[]; content: Record<string, unknown> }) => {
          const result = await this.options.httpClient.post("/validate", {
            body: params,
          });
          return toToolResult(normalizeOutcome(result));
        },
      },
      { names: [SENDIT_TOOL_NAMES.validate] }
    );

    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.uploadMedia,
        label: "SendIt Upload Media",
        description:
          "Upload local media file to SendIt or validate an existing media URL.",
        parameters: Type.Object({
          filePath: Type.Optional(Type.String()),
          mediaUrl: Type.Optional(Type.String()),
          folder: Type.Optional(Type.String()),
        }),
        execute: async (
          _toolCallId: string,
          params: { filePath?: string; mediaUrl?: string; folder?: string }
        ) => {
          if (!params.filePath && !params.mediaUrl) {
            return toToolResult(
              fail({
                code: "invalid_input",
                message: "Either filePath or mediaUrl is required.",
                retryable: false,
              })
            );
          }

          if (params.filePath) {
            const buffer = await readFile(params.filePath);
            const blob = new Blob([buffer], { type: detectMimeType(params.filePath) });
            const formData = new FormData();
            formData.set("file", blob, basename(params.filePath));
            if (params.folder) {
              formData.set("folder", params.folder);
            }

            const result = await this.options.httpClient.post("/media/upload", {
              formData,
            });
            return toToolResult(normalizeOutcome(result));
          }

          const result = await this.options.httpClient.post("/media", {
            body: {
              mediaUrl: params.mediaUrl,
              folder: params.folder,
            },
          });
          return toToolResult(normalizeOutcome(result));
        },
      },
      { names: [SENDIT_TOOL_NAMES.uploadMedia], optional: true }
    );

    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.publish,
        label: "SendIt Publish",
        description: "Publish content immediately to selected platforms.",
        parameters: Type.Object({
          platforms: Type.Array(PLATFORM_TYPE, { minItems: 1 }),
          content: Type.Object({}, { additionalProperties: true }),
        }),
        execute: async (
          _toolCallId: string,
          params: { platforms: string[]; content: Record<string, unknown> }
        ) => {
          const result = await this.options.httpClient.post("/publish", {
            body: params,
          });
          return toToolResult(normalizeOutcome(result));
        },
      },
      { names: [SENDIT_TOOL_NAMES.publish], optional: true }
    );

    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.schedule,
        label: "SendIt Schedule",
        description: "Schedule content for a future publish time.",
        parameters: Type.Object({
          platforms: Type.Array(PLATFORM_TYPE, { minItems: 1 }),
          content: Type.Object({}, { additionalProperties: true }),
          scheduledTime: Type.String(),
        }),
        execute: async (
          _toolCallId: string,
          params: {
            platforms: string[];
            content: Record<string, unknown>;
            scheduledTime: string;
          }
        ) => {
          const result = await this.options.httpClient.post("/schedule", {
            body: params,
          });
          return toToolResult(normalizeOutcome(result));
        },
      },
      { names: [SENDIT_TOOL_NAMES.schedule], optional: true }
    );

    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.listScheduled,
        label: "SendIt List Scheduled",
        description: "List pending scheduled posts.",
        parameters: Type.Object({
          platform: Type.Optional(PLATFORM_TYPE),
        }),
        execute: async (_toolCallId: string, params: { platform?: string }) => {
          const result = await this.options.httpClient.get("/scheduled", {
            query: { platform: params.platform },
          });
          return toToolResult(normalizeOutcome(result));
        },
      },
      { names: [SENDIT_TOOL_NAMES.listScheduled] }
    );

    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.triggerScheduled,
        label: "SendIt Trigger Scheduled",
        description: "Trigger a scheduled post immediately.",
        parameters: Type.Object({
          scheduleId: Type.String(),
        }),
        execute: async (_toolCallId: string, params: { scheduleId: string }) => {
          const result = await this.options.httpClient.post(
            `/scheduled/${params.scheduleId}/trigger`
          );
          return toToolResult(normalizeOutcome(result));
        },
      },
      { names: [SENDIT_TOOL_NAMES.triggerScheduled], optional: true }
    );

    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.deleteScheduled,
        label: "SendIt Delete Scheduled",
        description: "Delete/cancel a scheduled post.",
        parameters: Type.Object({
          scheduleId: Type.String(),
        }),
        execute: async (_toolCallId: string, params: { scheduleId: string }) => {
          const result = await this.options.httpClient.delete(
            `/scheduled/${params.scheduleId}`
          );
          return toToolResult(normalizeOutcome(result));
        },
      },
      { names: [SENDIT_TOOL_NAMES.deleteScheduled], optional: true }
    );

    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.analytics,
        label: "SendIt Analytics",
        description: "Fetch analytics for a platform.",
        parameters: Type.Object({
          platform: PLATFORM_TYPE,
        }),
        execute: async (_toolCallId: string, params: { platform: string }) => {
          const result = await this.options.httpClient.get("/analytics", {
            query: { platform: params.platform },
          });
          return toToolResult(normalizeOutcome(result));
        },
      },
      { names: [SENDIT_TOOL_NAMES.analytics] }
    );
  }

  private registerGrowthTools(api: OpenClawPluginApi): void {
    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.inbox,
        label: "SendIt Inbox",
        description:
          "Unified inbox operations. Actions: list, get, reply, update_status.",
        parameters: Type.Object(
          {
            action: Type.Union([
              Type.Literal("list"),
              Type.Literal("get"),
              Type.Literal("reply"),
              Type.Literal("update_status"),
            ]),
            threadId: Type.Optional(Type.String()),
            platform: Type.Optional(PLATFORM_TYPE),
            status: Type.Optional(
              Type.Union([
                Type.Literal("open"),
                Type.Literal("replied"),
                Type.Literal("closed"),
                Type.Literal("archived"),
              ])
            ),
            text: Type.Optional(Type.String()),
            limit: Type.Optional(Type.Number()),
          },
          { additionalProperties: true }
        ),
        execute: async (
          _toolCallId: string,
          params: {
            action: "list" | "get" | "reply" | "update_status";
            threadId?: string;
            platform?: string;
            status?: string;
            text?: string;
            limit?: number;
          }
        ) => {
          switch (params.action) {
            case "list": {
              const result = await this.options.httpClient.get("/inbox", {
                query: {
                  platform: params.platform,
                  status: params.status,
                  limit: params.limit,
                },
              });
              return toToolResult(normalizeOutcome(result));
            }
            case "get": {
              if (!params.threadId) {
                return toToolResult(
                  fail({
                    code: "invalid_input",
                    message: "threadId is required for action=get",
                    retryable: false,
                  })
                );
              }
              const result = await this.options.httpClient.get(
                `/inbox/${params.threadId}`
              );
              return toToolResult(normalizeOutcome(result));
            }
            case "reply": {
              if (!params.threadId || !params.text) {
                return toToolResult(
                  fail({
                    code: "invalid_input",
                    message: "threadId and text are required for action=reply",
                    retryable: false,
                  })
                );
              }
              const result = await this.options.httpClient.post(
                `/inbox/${params.threadId}/reply`,
                {
                  body: { text: params.text },
                }
              );
              return toToolResult(normalizeOutcome(result));
            }
            case "update_status": {
              if (!params.threadId || !params.status) {
                return toToolResult(
                  fail({
                    code: "invalid_input",
                    message: "threadId and status are required for action=update_status",
                    retryable: false,
                  })
                );
              }
              const result = await this.options.httpClient.post(
                `/inbox/${params.threadId}/status`,
                {
                  body: { status: params.status },
                }
              );
              return toToolResult(normalizeOutcome(result));
            }
            default:
              return toToolResult(
                fail({
                  code: "invalid_action",
                  message: `Unsupported inbox action: ${(params as { action: string }).action}`,
                  retryable: false,
                })
              );
          }
        },
      },
      { names: [SENDIT_TOOL_NAMES.inbox], optional: true }
    );

    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.listening,
        label: "SendIt Listening",
        description:
          "Social listening operations. Actions include keyword, mention, alert, summary, and refresh flows.",
        parameters: Type.Object(
          {
            action: Type.String(),
            id: Type.Optional(Type.String()),
            ids: Type.Optional(Type.Array(Type.String())),
            keyword: Type.Optional(Type.String()),
            type: Type.Optional(Type.String()),
            platform: Type.Optional(PLATFORM_TYPE),
            limit: Type.Optional(Type.Number()),
            offset: Type.Optional(Type.Number()),
            unread: Type.Optional(Type.Boolean()),
            active: Type.Optional(Type.Boolean()),
            payload: Type.Optional(Type.Object({}, { additionalProperties: true })),
          },
          { additionalProperties: true }
        ),
        execute: async (
          _toolCallId: string,
          params: {
            action: string;
            id?: string;
            ids?: string[];
            keyword?: string;
            type?: string;
            platform?: string;
            limit?: number;
            offset?: number;
            unread?: boolean;
            active?: boolean;
            payload?: Record<string, unknown>;
          }
        ) => {
          const action = params.action;

          if (action === "list_keywords") {
            return toToolResult(
              normalizeOutcome(
                await this.options.httpClient.get("/listening/keywords", {
                  query: {
                    active: params.active,
                    type: params.type,
                  },
                })
              )
            );
          }

          if (action === "create_keyword") {
            return toToolResult(
              normalizeOutcome(
                await this.options.httpClient.post("/listening/keywords", {
                  body: params.payload || {
                    keyword: params.keyword,
                    type: params.type,
                  },
                })
              )
            );
          }

          if (action === "get_keyword") {
            if (!params.id) {
              return toToolResult(
                fail({
                  code: "invalid_input",
                  message: "id is required for get_keyword",
                  retryable: false,
                })
              );
            }
            return toToolResult(
              normalizeOutcome(
                await this.options.httpClient.get(`/listening/keywords/${params.id}`)
              )
            );
          }

          if (action === "update_keyword") {
            if (!params.id) {
              return toToolResult(
                fail({
                  code: "invalid_input",
                  message: "id is required for update_keyword",
                  retryable: false,
                })
              );
            }
            return toToolResult(
              normalizeOutcome(
                await this.options.httpClient.patch(`/listening/keywords/${params.id}`, {
                  body: params.payload || {},
                })
              )
            );
          }

          if (action === "delete_keyword") {
            if (!params.id) {
              return toToolResult(
                fail({
                  code: "invalid_input",
                  message: "id is required for delete_keyword",
                  retryable: false,
                })
              );
            }
            return toToolResult(
              normalizeOutcome(
                await this.options.httpClient.delete(`/listening/keywords/${params.id}`)
              )
            );
          }

          if (action === "list_mentions") {
            return toToolResult(
              normalizeOutcome(
                await this.options.httpClient.get("/listening/mentions", {
                  query: {
                    platform: params.platform,
                    limit: params.limit,
                    offset: params.offset,
                  },
                })
              )
            );
          }

          if (action === "get_mention") {
            if (!params.id) {
              return toToolResult(
                fail({
                  code: "invalid_input",
                  message: "id is required for get_mention",
                  retryable: false,
                })
              );
            }
            return toToolResult(
              normalizeOutcome(
                await this.options.httpClient.get(`/listening/mentions/${params.id}`)
              )
            );
          }

          if (action === "mark_mentions_read") {
            return toToolResult(
              normalizeOutcome(
                await this.options.httpClient.post("/listening/mentions/mark-read", {
                  body: { ids: params.ids || [] },
                })
              )
            );
          }

          if (action === "archive_mentions") {
            return toToolResult(
              normalizeOutcome(
                await this.options.httpClient.post("/listening/mentions/archive", {
                  body: { ids: params.ids || [] },
                })
              )
            );
          }

          if (action === "list_alerts") {
            return toToolResult(
              normalizeOutcome(
                await this.options.httpClient.get("/listening/alerts", {
                  query: {
                    unread: params.unread,
                    limit: params.limit,
                  },
                })
              )
            );
          }

          if (action === "mark_alerts_read") {
            return toToolResult(
              normalizeOutcome(
                await this.options.httpClient.post("/listening/alerts/mark-read", {
                  body: { ids: params.ids || [] },
                })
              )
            );
          }

          if (action === "dismiss_alerts") {
            return toToolResult(
              normalizeOutcome(
                await this.options.httpClient.post("/listening/alerts/dismiss", {
                  body: { ids: params.ids || [] },
                })
              )
            );
          }

          if (action === "summary") {
            return toToolResult(
              normalizeOutcome(
                await this.options.httpClient.get("/listening/summary")
              )
            );
          }

          if (action === "refresh") {
            return toToolResult(
              normalizeOutcome(
                await this.options.httpClient.post("/listening/refresh")
              )
            );
          }

          return toToolResult(
            fail({
              code: "invalid_action",
              message: `Unsupported listening action: ${action}`,
              retryable: false,
            })
          );
        },
      },
      { names: [SENDIT_TOOL_NAMES.listening], optional: true }
    );

    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.campaigns,
        label: "SendIt Campaigns",
        description: "Campaign operations. Actions: list, create_plan, schedule.",
        parameters: Type.Object(
          {
            action: Type.Union([
              Type.Literal("list"),
              Type.Literal("create_plan"),
              Type.Literal("schedule"),
            ]),
            id: Type.Optional(Type.String()),
            brief: Type.Optional(Type.String()),
            platforms: Type.Optional(Type.Array(PLATFORM_TYPE)),
            postCount: Type.Optional(Type.Number()),
            startDate: Type.Optional(Type.String()),
            endDate: Type.Optional(Type.String()),
          },
          { additionalProperties: true }
        ),
        execute: async (
          _toolCallId: string,
          params: {
            action: "list" | "create_plan" | "schedule";
            id?: string;
            brief?: string;
            platforms?: string[];
            postCount?: number;
            startDate?: string;
            endDate?: string;
          }
        ) => {
          if (params.action === "list") {
            const result = await this.options.httpClient.get("/campaigns");
            return toToolResult(normalizeOutcome(result));
          }

          if (params.action === "create_plan") {
            const result = await this.options.httpClient.post("/campaigns", {
              body: {
                brief: params.brief,
                platforms: params.platforms,
                postCount: params.postCount,
                startDate: params.startDate,
                endDate: params.endDate,
              },
            });
            return toToolResult(normalizeOutcome(result));
          }

          if (!params.id) {
            return toToolResult(
              fail({
                code: "invalid_input",
                message: "id is required for campaign schedule action",
                retryable: false,
              })
            );
          }

          const result = await this.options.httpClient.post(
            `/campaigns/${params.id}/schedule`
          );
          return toToolResult(normalizeOutcome(result));
        },
      },
      { names: [SENDIT_TOOL_NAMES.campaigns], optional: true }
    );

    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.brandVoice,
        label: "SendIt Brand Voice",
        description:
          "Brand voice operations. Actions: list, create, get, update, delete, set_default.",
        parameters: Type.Object(
          {
            action: Type.Union([
              Type.Literal("list"),
              Type.Literal("create"),
              Type.Literal("get"),
              Type.Literal("update"),
              Type.Literal("delete"),
              Type.Literal("set_default"),
            ]),
            id: Type.Optional(Type.String()),
            payload: Type.Optional(Type.Object({}, { additionalProperties: true })),
          },
          { additionalProperties: true }
        ),
        execute: async (
          _toolCallId: string,
          params: {
            action:
              | "list"
              | "create"
              | "get"
              | "update"
              | "delete"
              | "set_default";
            id?: string;
            payload?: Record<string, unknown>;
          }
        ) => {
          switch (params.action) {
            case "list": {
              return toToolResult(
                normalizeOutcome(await this.options.httpClient.get("/brand-voice"))
              );
            }
            case "create": {
              return toToolResult(
                normalizeOutcome(
                  await this.options.httpClient.post("/brand-voice", {
                    body: params.payload || {},
                  })
                )
              );
            }
            case "get": {
              if (!params.id) {
                return toToolResult(
                  fail({
                    code: "invalid_input",
                    message: "id is required for brand_voice get",
                    retryable: false,
                  })
                );
              }
              return toToolResult(
                normalizeOutcome(
                  await this.options.httpClient.get(`/brand-voice/${params.id}`)
                )
              );
            }
            case "update": {
              if (!params.id) {
                return toToolResult(
                  fail({
                    code: "invalid_input",
                    message: "id is required for brand_voice update",
                    retryable: false,
                  })
                );
              }
              return toToolResult(
                normalizeOutcome(
                  await this.options.httpClient.patch(`/brand-voice/${params.id}`, {
                    body: params.payload || {},
                  })
                )
              );
            }
            case "delete": {
              if (!params.id) {
                return toToolResult(
                  fail({
                    code: "invalid_input",
                    message: "id is required for brand_voice delete",
                    retryable: false,
                  })
                );
              }
              return toToolResult(
                normalizeOutcome(
                  await this.options.httpClient.delete(`/brand-voice/${params.id}`)
                )
              );
            }
            case "set_default": {
              if (!params.id) {
                return toToolResult(
                  fail({
                    code: "invalid_input",
                    message: "id is required for brand_voice set_default",
                    retryable: false,
                  })
                );
              }
              return toToolResult(
                normalizeOutcome(
                  await this.options.httpClient.post(`/brand-voice/${params.id}/default`)
                )
              );
            }
            default:
              return toToolResult(
                fail({
                  code: "invalid_action",
                  message: `Unsupported brand_voice action: ${(params as { action: string }).action}`,
                  retryable: false,
                })
              );
          }
        },
      },
      { names: [SENDIT_TOOL_NAMES.brandVoice], optional: true }
    );
  }

  private registerAdvancedTools(api: OpenClawPluginApi): void {
    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.aiDraftReply,
        label: "SendIt AI Draft Reply",
        description: "MCP-backed AI draft reply for social mentions.",
        parameters: Type.Object({
          mention_id: Type.String(),
          tone: Type.Optional(Type.String()),
          max_length: Type.Optional(Type.Number()),
        }),
        execute: async (
          _toolCallId: string,
          params: { mention_id: string; tone?: string; max_length?: number }
        ) => {
          const outcome = await this.callMcpTool("draft_reply", params);
          return toToolResult(normalizeOutcome(outcome));
        },
      },
      { names: [SENDIT_TOOL_NAMES.aiDraftReply], optional: true }
    );

    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.aiSummarizeMentions,
        label: "SendIt AI Summarize Mentions",
        description: "MCP-backed mention clustering and summarization.",
        parameters: Type.Object(
          {
            since: Type.Optional(Type.String()),
            platform: Type.Optional(PLATFORM_TYPE),
            keyword_id: Type.Optional(Type.String()),
            limit: Type.Optional(Type.Number()),
          },
          { additionalProperties: true }
        ),
        execute: async (
          _toolCallId: string,
          params: {
            since?: string;
            platform?: string;
            keyword_id?: string;
            limit?: number;
          }
        ) => {
          const outcome = await this.callMcpTool("summarize_mentions", params);
          return toToolResult(normalizeOutcome(outcome));
        },
      },
      { names: [SENDIT_TOOL_NAMES.aiSummarizeMentions], optional: true }
    );

    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.aiGeneratePostBundle,
        label: "SendIt AI Generate Post Bundle",
        description: "MCP-backed multi-variant post generation and scoring.",
        parameters: Type.Object(
          {
            platforms: Type.Array(PLATFORM_TYPE, { minItems: 1 }),
            prompt: Type.String(),
            variant_count: Type.Optional(Type.Number()),
            generation: Type.Optional(Type.Object({}, { additionalProperties: true })),
          },
          { additionalProperties: true }
        ),
        execute: async (
          _toolCallId: string,
          params: {
            platforms: string[];
            prompt: string;
            variant_count?: number;
            generation?: Record<string, unknown>;
          }
        ) => {
          const outcome = await this.callMcpTool("generate_post_bundle", params);
          return toToolResult(normalizeOutcome(outcome));
        },
      },
      { names: [SENDIT_TOOL_NAMES.aiGeneratePostBundle], optional: true }
    );

    api.registerTool(
      {
        name: SENDIT_TOOL_NAMES.aiCritiquePost,
        label: "SendIt AI Critique Post",
        description: "MCP-backed AI critique and score for a draft post.",
        parameters: Type.Object(
          {
            platforms: Type.Array(PLATFORM_TYPE, { minItems: 1 }),
            text: Type.String(),
            mediaUrl: Type.Optional(Type.String()),
          },
          { additionalProperties: true }
        ),
        execute: async (
          _toolCallId: string,
          params: { platforms: string[]; text: string; mediaUrl?: string }
        ) => {
          const outcome = await this.callMcpTool("critique_post", params);
          return toToolResult(normalizeOutcome(outcome));
        },
      },
      { names: [SENDIT_TOOL_NAMES.aiCritiquePost], optional: true }
    );
  }
}
