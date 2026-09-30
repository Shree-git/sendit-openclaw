import { Type } from '@sinclair/typebox';
import { SENDIT_TOOL_NAMES } from '../constants.js';
import {
  PLATFORM_TYPE,
  PAGINATION_PARAMS,
  TEAM_ID_PARAM,
  fail,
  toToolResult,
  dispatchMcpAction,
  type ToolRuntimeDeps,
  type OpenClawPluginApi,
} from './shared.js';

export function registerAdvancedTools(api: OpenClawPluginApi, deps: ToolRuntimeDeps): void {
  // ════════════════════════════════════════════════════════════════
  //  AI Tools (MCP-backed)
  // ════════════════════════════════════════════════════════════════

  // ── sendit_ai_draft_reply ────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.aiDraftReply,
      label: 'SendIt AI Draft Reply',
      description:
        'Generate an AI-drafted reply for a social mention. ' +
        'Optionally specify tone (professional, casual, friendly, witty) and max length. ' +
        'Review the draft before sending via sendit_inbox reply action.' +
        ' Related: Use sendit_inbox to send the approved reply. Use sendit_listening to find mentions.',
      parameters: Type.Object({
        mention_id: Type.String({ description: 'Mention ID to draft a reply for.' }),
        tone: Type.Optional(
          Type.String({ description: 'Tone of the reply (professional, casual, friendly, witty).' })
        ),
        max_length: Type.Optional(
          Type.Number({ description: 'Maximum character length for the reply.' })
        ),
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: { mention_id: string; tone?: string; max_length?: number; teamId?: string }
      ) => {
        const outcome = await deps.callMcpTool('draft_reply', params);
        return toToolResult(deps.normalizeOutcome(outcome));
      },
    },
    { names: [SENDIT_TOOL_NAMES.aiDraftReply], optional: true }
  );

  // ── sendit_ai_summarize_mentions ─────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.aiSummarizeMentions,
      label: 'SendIt AI Summarize Mentions',
      description:
        'AI-powered clustering and summarization of brand mentions. ' +
        'Groups mentions by theme and sentiment, highlighting key topics and emerging trends. ' +
        'Useful for daily/weekly social listening reports.' +
        ' Related: Use sendit_listening for raw mention data. Use sendit_ai_draft_reply to respond.',
      parameters: Type.Object({
        since: Type.Optional(
          Type.String({ description: 'ISO 8601 start date for mentions window.' })
        ),
        platform: Type.Optional(PLATFORM_TYPE),
        keyword_id: Type.Optional(
          Type.String({ description: 'Filter to a specific tracked keyword.' })
        ),
        limit: Type.Optional(Type.Number({ description: 'Max mentions to analyze.' })),
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: {
          since?: string;
          platform?: string;
          keyword_id?: string;
          limit?: number;
          teamId?: string;
        }
      ) => {
        const outcome = await deps.callMcpTool('summarize_mentions', params);
        return toToolResult(deps.normalizeOutcome(outcome));
      },
    },
    { names: [SENDIT_TOOL_NAMES.aiSummarizeMentions], optional: true }
  );

  // ── sendit_ai_generate_post_bundle ───────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.aiGeneratePostBundle,
      label: 'SendIt AI Generate Post Bundle',
      description:
        'Generate multiple platform-optimized post variants from a single prompt. ' +
        "Each variant is tailored to the target platform's character limits and conventions. " +
        'Returns scored variants ranked by predicted engagement.' +
        ' Related: Use sendit_ai_critique_post to score variants. Use sendit_content_score for quantitative scoring.',
      parameters: Type.Object({
        platforms: Type.Array(PLATFORM_TYPE, { minItems: 1 }),
        prompt: Type.String({ description: 'Creative brief or topic for post generation.' }),
        variant_count: Type.Optional(
          Type.Number({ description: 'Number of variants to generate (default 3).' })
        ),
        generation: Type.Optional(Type.Object({}, { additionalProperties: true })),
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: {
          platforms: string[];
          prompt: string;
          variant_count?: number;
          generation?: Record<string, unknown>;
          teamId?: string;
        }
      ) => {
        const outcome = await deps.callMcpTool('generate_post_bundle', params);
        return toToolResult(deps.normalizeOutcome(outcome));
      },
    },
    { names: [SENDIT_TOOL_NAMES.aiGeneratePostBundle], optional: true }
  );

  // ── sendit_ai_critique_post ──────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.aiCritiquePost,
      label: 'SendIt AI Critique Post',
      description:
        'AI critique and scoring for a draft post. Returns a quality score, improvement suggestions, ' +
        'platform-specific warnings, and engagement predictions. ' +
        'Use before publishing to optimize content quality.' +
        ' Related: Use sendit_ai_generate_post_bundle for alternatives. Use sendit_content_score for numeric scoring.',
      parameters: Type.Object({
        platforms: Type.Array(PLATFORM_TYPE, { minItems: 1 }),
        text: Type.String({ description: 'Draft post text to critique.' }),
        mediaUrl: Type.Optional(Type.String({ description: 'Media URL to include in critique.' })),
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: { platforms: string[]; text: string; mediaUrl?: string; teamId?: string }
      ) => {
        const outcome = await deps.callMcpTool('critique_post', params);
        return toToolResult(deps.normalizeOutcome(outcome));
      },
    },
    { names: [SENDIT_TOOL_NAMES.aiCritiquePost], optional: true }
  );

  // ════════════════════════════════════════════════════════════════
  //  Analytics v2 (MCP-backed)
  // ════════════════════════════════════════════════════════════════

  // ── sendit_unified_analytics ─────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.unifiedAnalytics,
      label: 'SendIt Unified Analytics',
      description:
        'Cross-platform analytics dashboard via MCP. Aggregates metrics from all connected accounts ' +
        'into a single view with comparisons, trends, and breakdowns by platform/period. ' +
        'For single-platform data, use sendit_analytics instead.' +
        ' Related: Use sendit_analytics for single-platform data. Use sendit_anomaly_alerts for unusual patterns.',
      parameters: Type.Object({
        action: Type.Optional(
          Type.Union(
            [Type.Literal('query'), Type.Literal('create_report'), Type.Literal('get_attribution')],
            { description: 'Action to perform (default: query).' }
          )
        ),
        platforms: Type.Optional(
          Type.Array(PLATFORM_TYPE, { description: 'Filter to specific platforms.' })
        ),
        dateRange: Type.Optional(
          Type.String({
            description: "Date range (e.g., '7d', '30d', '90d', or 'YYYY-MM-DD/YYYY-MM-DD').",
          })
        ),
        metrics: Type.Optional(
          Type.Array(Type.String(), { description: 'Specific metrics to include.' })
        ),
        name: Type.Optional(Type.String({ description: 'Report name (for create_report).' })),
        reportType: Type.Optional(
          Type.String({
            description:
              'Report type: performance_overview, channel_comparison, content_analysis, ad_performance, attribution, executive_summary.',
          })
        ),
        reportSchedule: Type.Optional(
          Type.Union([Type.Literal('daily'), Type.Literal('weekly'), Type.Literal('monthly')], {
            description: 'Report schedule frequency.',
          })
        ),
        attributionModel: Type.Optional(
          Type.String({
            description:
              'Attribution model: first_touch, last_touch, linear, time_decay, position_based, data_driven.',
          })
        ),
        conversionType: Type.Optional(
          Type.String({ description: 'Conversion type to attribute.' })
        ),
        ...TEAM_ID_PARAM,
        ...PAGINATION_PARAMS,
      }),
      execute: async (
        _toolCallId: string,
        params: {
          action?: string;
          platforms?: string[];
          dateRange?: string;
          metrics?: string[];
          name?: string;
          reportType?: string;
          reportSchedule?: string;
          attributionModel?: string;
          conversionType?: string;
          teamId?: string;
          limit?: number;
          offset?: number;
        }
      ) => {
        const action = params.action || 'query';
        const mcpToolMap: Record<string, string> = {
          query: 'get_unified_analytics',
          create_report: 'create_analytics_report',
          get_attribution: 'get_attribution_data',
        };
        const mcpTool = mcpToolMap[action];
        if (!mcpTool) {
          return toToolResult(
            fail({
              code: 'invalid_action',
              message: `Unsupported unified_analytics action: ${action}`,
              retryable: false,
            })
          );
        }
        const { action: _a, ...rest } = params;
        const outcome = await deps.callMcpTool(mcpTool, rest);
        return toToolResult(deps.normalizeOutcome(outcome));
      },
    },
    { names: [SENDIT_TOOL_NAMES.unifiedAnalytics], optional: true }
  );

  // ── sendit_anomaly_alerts ────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.anomalyAlerts,
      label: 'SendIt Anomaly Alerts',
      description:
        'Detect unusual engagement patterns — viral posts, engagement drops, follower spikes, or shadowban indicators. ' +
        'Returns severity-ranked alerts with context and recommended actions.' +
        ' Related: Use sendit_unified_analytics for baseline metrics. Use sendit_status to check system health.',
      parameters: Type.Object({
        platform: Type.Optional(PLATFORM_TYPE),
        since: Type.Optional(Type.String({ description: 'ISO 8601 start date.' })),
        severity: Type.Optional(
          Type.Union([Type.Literal('info'), Type.Literal('warning'), Type.Literal('critical')])
        ),
        ...TEAM_ID_PARAM,
        ...PAGINATION_PARAMS,
      }),
      execute: async (
        _toolCallId: string,
        params: {
          platform?: string;
          since?: string;
          severity?: string;
          teamId?: string;
          limit?: number;
          offset?: number;
        }
      ) => {
        const outcome = await deps.callMcpTool('get_anomaly_alerts', params);
        return toToolResult(deps.normalizeOutcome(outcome));
      },
    },
    { names: [SENDIT_TOOL_NAMES.anomalyAlerts], optional: true }
  );

  // ── sendit_benchmark ─────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.benchmark,
      label: 'SendIt Benchmark Comparison',
      description:
        'Compare your engagement metrics against industry benchmarks for your account size and niche. ' +
        'Returns percentile rankings and areas for improvement.' +
        ' Related: Use sendit_unified_analytics for your own metrics. Use sendit_content_score to improve content.',
      parameters: Type.Object({
        platform: PLATFORM_TYPE,
        metric: Type.Optional(
          Type.String({
            description:
              "Specific metric to benchmark (e.g., 'engagement_rate', 'follower_growth').",
          })
        ),
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: { platform: string; metric?: string; teamId?: string }
      ) => {
        const outcome = await deps.callMcpTool('get_benchmark_comparison', params);
        return toToolResult(deps.normalizeOutcome(outcome));
      },
    },
    { names: [SENDIT_TOOL_NAMES.benchmark], optional: true }
  );

  // ════════════════════════════════════════════════════════════════
  //  Ads (MCP-backed)
  // ════════════════════════════════════════════════════════════════

  // ── sendit_ads ───────────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.ads,
      label: 'SendIt Ads',
      description:
        'Manage paid advertising campaigns across platforms. ' +
        'Create campaigns, upload creatives, and track performance metrics. ' +
        'Supports Facebook Ads, LinkedIn Ads, X Ads, and more.' +
        ' Related: Use sendit_unified_analytics for organic+paid comparison. Use sendit_analytics for organic-only.',
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal('list_accounts'),
          Type.Literal('create_campaign'),
          Type.Literal('list_campaigns'),
          Type.Literal('update_campaign'),
          Type.Literal('create_creative'),
          Type.Literal('get_performance'),
          Type.Literal('get_report'),
        ]),
        id: Type.Optional(Type.String({ description: 'Campaign or creative ID.' })),
        platform: Type.Optional(PLATFORM_TYPE),
        name: Type.Optional(
          Type.String({ description: 'Campaign name (required for create_campaign).' })
        ),
        objective: Type.Optional(
          Type.Union(
            [
              Type.Literal('awareness'),
              Type.Literal('traffic'),
              Type.Literal('engagement'),
              Type.Literal('leads'),
              Type.Literal('conversions'),
              Type.Literal('app_installs'),
              Type.Literal('video_views'),
              Type.Literal('reach'),
            ],
            { description: 'Campaign objective.' }
          )
        ),
        budgetType: Type.Optional(
          Type.Union([Type.Literal('daily'), Type.Literal('lifetime')], {
            description: 'Budget type.',
          })
        ),
        budgetAmount: Type.Optional(Type.Number({ description: 'Budget amount in cents.' })),
        currency: Type.Optional(Type.String({ description: 'Currency code (default: USD).' })),
        startDate: Type.Optional(Type.String({ description: 'Campaign start date (ISO 8601).' })),
        endDate: Type.Optional(Type.String({ description: 'Campaign end date (ISO 8601).' })),
        status: Type.Optional(
          Type.Union(
            [
              Type.Literal('draft'),
              Type.Literal('active'),
              Type.Literal('paused'),
              Type.Literal('completed'),
              Type.Literal('archived'),
            ],
            { description: 'Campaign status (for update_campaign).' }
          )
        ),
        campaignId: Type.Optional(
          Type.String({ description: 'Campaign ID (for create_creative).' })
        ),
        creativeType: Type.Optional(
          Type.Union(
            [
              Type.Literal('image'),
              Type.Literal('video'),
              Type.Literal('carousel'),
              Type.Literal('text'),
              Type.Literal('native'),
            ],
            { description: 'Creative type.' }
          )
        ),
        headline: Type.Optional(Type.String({ description: 'Ad headline.' })),
        adDescription: Type.Optional(Type.String({ description: 'Ad description text.' })),
        mediaUrl: Type.Optional(Type.String({ description: 'Creative media URL.' })),
        callToAction: Type.Optional(
          Type.Union(
            [
              Type.Literal('learn_more'),
              Type.Literal('shop_now'),
              Type.Literal('sign_up'),
              Type.Literal('book_now'),
              Type.Literal('contact_us'),
              Type.Literal('download'),
              Type.Literal('get_offer'),
              Type.Literal('subscribe'),
            ],
            { description: 'Call to action button.' }
          )
        ),
        landingUrl: Type.Optional(Type.String({ description: 'Landing page URL.' })),
        ...TEAM_ID_PARAM,
        ...PAGINATION_PARAMS,
      }),
      execute: async (_toolCallId: string, params: { action: string; [key: string]: unknown }) => {
        return dispatchMcpAction(
          deps,
          params,
          {
            list_accounts: 'list_ad_accounts',
            create_campaign: 'create_ad_campaign',
            list_campaigns: 'list_ad_campaigns',
            update_campaign: 'update_ad_campaign',
            create_creative: 'create_ad_creative',
            get_performance: 'get_ad_performance',
            get_report: 'get_unified_ad_report',
          },
          'ads'
        );
      },
    },
    { names: [SENDIT_TOOL_NAMES.ads], optional: true }
  );

  // ════════════════════════════════════════════════════════════════
  //  CRM (MCP-backed)
  // ════════════════════════════════════════════════════════════════

  // ── sendit_crm ───────────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.crm,
      label: 'SendIt CRM',
      description:
        'Social CRM for managing customer conversations across platforms. ' +
        'Track conversation threads, reply to customers, update status, and escalate to support tools. ' +
        'Integrates with Zendesk, Intercom, HubSpot, and Salesforce for escalation.' +
        ' Related: Use sendit_ai_draft_reply for AI-assisted responses. Use sendit_inbox for quick replies.',
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal('list_conversations'),
          Type.Literal('get_conversation'),
          Type.Literal('reply'),
          Type.Literal('update'),
          Type.Literal('get_summary'),
          Type.Literal('escalate'),
        ]),
        id: Type.Optional(Type.String({ description: 'Conversation ID.' })),
        status: Type.Optional(
          Type.Union(
            [
              Type.Literal('open'),
              Type.Literal('closed'),
              Type.Literal('snoozed'),
              Type.Literal('archived'),
            ],
            { description: 'Conversation status.' }
          )
        ),
        sentiment: Type.Optional(Type.String({ description: 'Filter by sentiment.' })),
        priority: Type.Optional(
          Type.Union(
            [
              Type.Literal('low'),
              Type.Literal('normal'),
              Type.Literal('high'),
              Type.Literal('urgent'),
            ],
            { description: 'Conversation priority.' }
          )
        ),
        text: Type.Optional(
          Type.String({ description: 'Reply text (required for reply action).' })
        ),
        assignedTo: Type.Optional(Type.String({ description: 'Filter or assign to user ID.' })),
        target: Type.Optional(
          Type.Union(
            [
              Type.Literal('zendesk'),
              Type.Literal('intercom'),
              Type.Literal('hubspot'),
              Type.Literal('salesforce'),
            ],
            { description: 'Escalation target (for escalate action).' }
          )
        ),
        tags: Type.Optional(Type.Array(Type.String(), { description: 'Conversation tags.' })),
        ...TEAM_ID_PARAM,
        ...PAGINATION_PARAMS,
      }),
      execute: async (_toolCallId: string, params: { action: string; [key: string]: unknown }) => {
        return dispatchMcpAction(
          deps,
          params,
          {
            list_conversations: 'list_conversations',
            get_conversation: 'get_conversation',
            reply: 'reply_to_conversation',
            update: 'update_conversation',
            get_summary: 'get_inbox_summary',
            escalate: 'escalate_to_support',
          },
          'CRM'
        );
      },
    },
    { names: [SENDIT_TOOL_NAMES.crm], optional: true }
  );

  // ════════════════════════════════════════════════════════════════
  //  Agents (MCP-backed)
  // ════════════════════════════════════════════════════════════════

  // ── sendit_agents ────────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.agents,
      label: 'SendIt Agents',
      description:
        'Manage and invoke SendIt AI agents for automated social workflows. ' +
        'List available agents, invoke them with inputs, monitor run progress, and view agent policies.' +
        ' Related: Use sendit_status to check agent availability.',
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal('list'),
          Type.Literal('invoke'),
          Type.Literal('get_run'),
          Type.Literal('list_runs'),
          Type.Literal('get_policies'),
          Type.Literal('update_policy'),
        ]),
        id: Type.Optional(Type.String({ description: 'Agent or run ID.' })),
        inputs: Type.Optional(
          Type.Object(
            {},
            { additionalProperties: true, description: 'Agent-specific input parameters.' }
          )
        ),
        ...TEAM_ID_PARAM,
        ...PAGINATION_PARAMS,
      }),
      execute: async (_toolCallId: string, params: { action: string; [key: string]: unknown }) => {
        return dispatchMcpAction(
          deps,
          params,
          {
            list: 'list_agents',
            invoke: 'invoke_agent',
            get_run: 'get_agent_run',
            list_runs: 'list_agent_runs',
            get_policies: 'get_agent_policies',
            update_policy: 'update_agent_policy',
          },
          'agents'
        );
      },
    },
    { names: [SENDIT_TOOL_NAMES.agents], optional: true }
  );

  // ════════════════════════════════════════════════════════════════
  //  Workflows (MCP-backed)
  // ════════════════════════════════════════════════════════════════

  // ── sendit_workflows ─────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.workflows,
      label: 'SendIt Workflows',
      description:
        'Create and manage automated social media workflows. ' +
        'Define trigger conditions, actions, and schedules. ' +
        'Monitor workflow runs and their execution status.' +
        ' Related: Use sendit_webhooks for external event triggers.',
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal('list'),
          Type.Literal('create'),
          Type.Literal('update'),
          Type.Literal('delete'),
          Type.Literal('trigger'),
          Type.Literal('list_runs'),
          Type.Literal('get_run'),
        ]),
        id: Type.Optional(Type.String({ description: 'Workflow or run ID.' })),
        name: Type.Optional(Type.String({ description: 'Workflow name (required for create).' })),
        triggerType: Type.Optional(
          Type.Union(
            [
              Type.Literal('manual'),
              Type.Literal('schedule'),
              Type.Literal('event'),
              Type.Literal('webhook'),
              Type.Literal('connector_event'),
            ],
            { description: 'Trigger type.' }
          )
        ),
        triggerConfig: Type.Optional(
          Type.Object({}, { additionalProperties: true, description: 'Trigger configuration.' })
        ),
        steps: Type.Optional(
          Type.Array(Type.Object({}, { additionalProperties: true }), {
            description: 'Workflow steps.',
          })
        ),
        active: Type.Optional(Type.Boolean({ description: 'Whether workflow is active.' })),
        ...TEAM_ID_PARAM,
        ...PAGINATION_PARAMS,
      }),
      execute: async (_toolCallId: string, params: { action: string; [key: string]: unknown }) => {
        return dispatchMcpAction(
          deps,
          params,
          {
            list: 'list_workflows',
            create: 'create_workflow',
            update: 'update_workflow',
            delete: 'delete_workflow',
            trigger: 'trigger_workflow',
            list_runs: 'list_workflow_runs',
            get_run: 'get_workflow_run',
          },
          'workflows'
        );
      },
    },
    { names: [SENDIT_TOOL_NAMES.workflows], optional: true }
  );

  // ════════════════════════════════════════════════════════════════
  //  Connectors (MCP-backed)
  // ════════════════════════════════════════════════════════════════

  // ── sendit_connectors ────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.connectors,
      label: 'SendIt Connectors',
      description:
        'Manage external service integrations (CMS, DAM, analytics, automation). ' +
        'Discover available connectors, check capabilities, connect/disconnect, and execute operations. ' +
        "Use 'health' to monitor connector status." +
        ' Related: Use sendit_workflows to automate connector operations.',
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal('list'),
          Type.Literal('capabilities'),
          Type.Literal('connect'),
          Type.Literal('disconnect'),
          Type.Literal('list_connected'),
          Type.Literal('health'),
          Type.Literal('execute'),
        ]),
        id: Type.Optional(Type.String({ description: 'Connector ID.' })),
        connectorId: Type.Optional(Type.String({ description: 'Connector identifier.' })),
        operation: Type.Optional(
          Type.String({ description: 'Operation name (for execute action).' })
        ),
        config: Type.Optional(
          Type.Object(
            {},
            { additionalProperties: true, description: 'Connection or operation configuration.' }
          )
        ),
        ...TEAM_ID_PARAM,
        ...PAGINATION_PARAMS,
      }),
      execute: async (_toolCallId: string, params: { action: string; [key: string]: unknown }) => {
        return dispatchMcpAction(
          deps,
          params,
          {
            list: 'list_connectors',
            capabilities: 'get_connector_capabilities',
            connect: 'connect_connector',
            disconnect: 'disconnect_connector',
            list_connected: 'list_connected_connectors',
            health: 'get_connector_health',
            execute: 'execute_connector_operation',
          },
          'connectors'
        );
      },
    },
    { names: [SENDIT_TOOL_NAMES.connectors], optional: true }
  );
}
