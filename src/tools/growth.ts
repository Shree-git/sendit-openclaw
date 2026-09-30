import { Type } from '@sinclair/typebox';
import { SENDIT_TOOL_NAMES } from '../constants.js';
import {
  PLATFORM_TYPE,
  PAGINATION_PARAMS,
  TEAM_ID_PARAM,
  fail,
  toToolResult,
  type ToolRuntimeDeps,
  type OpenClawPluginApi,
} from './shared.js';

export function registerGrowthTools(api: OpenClawPluginApi, deps: ToolRuntimeDeps): void {
  // ── sendit_inbox ─────────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.inbox,
      label: 'SendIt Inbox',
      description:
        'Unified social inbox for managing comments, mentions, and messages across all platforms. ' +
        'Supports listing threads, viewing thread details, replying, and updating thread status. ' +
        'Filter by platform or status to manage high-volume inboxes efficiently.' +
        ' Related: Use sendit_ai_draft_reply for AI-assisted replies. Use sendit_crm for full conversation management.',
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal('list'),
          Type.Literal('get'),
          Type.Literal('reply'),
          Type.Literal('update_status'),
        ]),
        threadId: Type.Optional(
          Type.String({ description: 'Thread ID (required for get, reply, update_status).' })
        ),
        platform: Type.Optional(PLATFORM_TYPE),
        status: Type.Optional(
          Type.Union([
            Type.Literal('open'),
            Type.Literal('replied'),
            Type.Literal('closed'),
            Type.Literal('archived'),
          ])
        ),
        text: Type.Optional(
          Type.String({ description: 'Reply text (required for reply action).' })
        ),
        ...PAGINATION_PARAMS,
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: {
          action: 'list' | 'get' | 'reply' | 'update_status';
          threadId?: string;
          platform?: string;
          status?: string;
          text?: string;
          limit?: number;
          offset?: number;
        }
      ) => {
        switch (params.action) {
          case 'list': {
            const result = await deps.httpClient.get('/inbox', {
              query: {
                platform: params.platform,
                status: params.status,
                limit: params.limit,
                offset: params.offset,
              },
            });
            return toToolResult(deps.normalizeOutcome(result));
          }
          case 'get': {
            if (!params.threadId) {
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'threadId is required for action=get',
                  retryable: false,
                })
              );
            }
            const result = await deps.httpClient.get(`/inbox/${params.threadId}`);
            return toToolResult(deps.normalizeOutcome(result));
          }
          case 'reply': {
            if (!params.threadId || !params.text) {
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'threadId and text are required for action=reply',
                  retryable: false,
                })
              );
            }
            const result = await deps.httpClient.post(`/inbox/${params.threadId}/reply`, {
              body: { text: params.text },
            });
            return toToolResult(deps.normalizeOutcome(result));
          }
          case 'update_status': {
            if (!params.threadId || !params.status) {
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'threadId and status are required for action=update_status',
                  retryable: false,
                })
              );
            }
            const result = await deps.httpClient.post(`/inbox/${params.threadId}/status`, {
              body: { status: params.status },
            });
            return toToolResult(deps.normalizeOutcome(result));
          }
          default:
            return toToolResult(
              fail({
                code: 'invalid_action',
                message: `Unsupported inbox action: ${(params as { action: string }).action}`,
                retryable: false,
              })
            );
        }
      },
    },
    { names: [SENDIT_TOOL_NAMES.inbox], optional: true }
  );

  // ── sendit_listening ─────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.listening,
      label: 'SendIt Listening',
      description:
        'Social listening for tracking keywords, monitoring brand mentions, and managing alerts. ' +
        'Supports keyword CRUD, mention browsing, alert management, and aggregate summaries. ' +
        "Use 'summary' action for a high-level overview, 'list_mentions' for detailed mention data." +
        ' Related: Use sendit_ai_summarize_mentions for AI analysis. Use sendit_inbox for direct replies.',
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal('list_keywords'),
          Type.Literal('create_keyword'),
          Type.Literal('get_keyword'),
          Type.Literal('update_keyword'),
          Type.Literal('delete_keyword'),
          Type.Literal('list_mentions'),
          Type.Literal('get_mention'),
          Type.Literal('mark_mentions_read'),
          Type.Literal('archive_mentions'),
          Type.Literal('list_alerts'),
          Type.Literal('get_alert'),
          Type.Literal('mark_alerts_read'),
          Type.Literal('dismiss_alerts'),
          Type.Literal('summary'),
          Type.Literal('refresh'),
        ]),
        id: Type.Optional(
          Type.String({ description: 'Resource ID (required for get/update/delete actions).' })
        ),
        ids: Type.Optional(
          Type.Array(Type.String(), { description: 'Bulk IDs for mark_read/archive/dismiss.' })
        ),
        keyword: Type.Optional(Type.String({ description: 'Keyword text for create_keyword.' })),
        type: Type.Optional(Type.String({ description: 'Keyword type filter.' })),
        platform: Type.Optional(PLATFORM_TYPE),
        unread: Type.Optional(Type.Boolean({ description: 'Filter alerts by unread status.' })),
        active: Type.Optional(Type.Boolean({ description: 'Filter keywords by active status.' })),
        ...PAGINATION_PARAMS,
        ...TEAM_ID_PARAM,
      }),
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
        }
      ) => {
        const { action } = params;

        switch (action) {
          case 'list_keywords':
            return toToolResult(
              deps.normalizeOutcome(
                await deps.httpClient.get('/listening/keywords', {
                  query: { active: params.active, type: params.type },
                })
              )
            );
          case 'create_keyword':
            return toToolResult(
              deps.normalizeOutcome(
                await deps.httpClient.post('/listening/keywords', {
                  body: { keyword: params.keyword, type: params.type },
                })
              )
            );
          case 'get_keyword': {
            if (!params.id)
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for get_keyword',
                  retryable: false,
                })
              );
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.get(`/listening/keywords/${params.id}`))
            );
          }
          case 'update_keyword': {
            if (!params.id)
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for update_keyword',
                  retryable: false,
                })
              );
            const body: Record<string, unknown> = {};
            for (const key of ['keyword', 'type', 'active']) {
              if ((params as Record<string, unknown>)[key] !== undefined)
                body[key] = (params as Record<string, unknown>)[key];
            }
            return toToolResult(
              deps.normalizeOutcome(
                await deps.httpClient.patch(`/listening/keywords/${params.id}`, { body })
              )
            );
          }
          case 'delete_keyword': {
            if (!params.id)
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for delete_keyword',
                  retryable: false,
                })
              );
            return toToolResult(
              deps.normalizeOutcome(
                await deps.httpClient.delete(`/listening/keywords/${params.id}`)
              )
            );
          }
          case 'list_mentions':
            return toToolResult(
              deps.normalizeOutcome(
                await deps.httpClient.get('/listening/mentions', {
                  query: { platform: params.platform, limit: params.limit, offset: params.offset },
                })
              )
            );
          case 'get_mention': {
            if (!params.id)
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for get_mention',
                  retryable: false,
                })
              );
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.get(`/listening/mentions/${params.id}`))
            );
          }
          case 'mark_mentions_read':
            return toToolResult(
              deps.normalizeOutcome(
                await deps.httpClient.post('/listening/mentions/mark-read', {
                  body: { ids: params.ids || [] },
                })
              )
            );
          case 'archive_mentions':
            return toToolResult(
              deps.normalizeOutcome(
                await deps.httpClient.post('/listening/mentions/archive', {
                  body: { ids: params.ids || [] },
                })
              )
            );
          case 'list_alerts':
            return toToolResult(
              deps.normalizeOutcome(
                await deps.httpClient.get('/listening/alerts', {
                  query: { unread: params.unread, limit: params.limit },
                })
              )
            );
          case 'get_alert': {
            if (!params.id)
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for get_alert',
                  retryable: false,
                })
              );
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.get(`/listening/alerts/${params.id}`))
            );
          }
          case 'mark_alerts_read':
            return toToolResult(
              deps.normalizeOutcome(
                await deps.httpClient.post('/listening/alerts/mark-read', {
                  body: { ids: params.ids || [] },
                })
              )
            );
          case 'dismiss_alerts':
            return toToolResult(
              deps.normalizeOutcome(
                await deps.httpClient.post('/listening/alerts/dismiss', {
                  body: { ids: params.ids || [] },
                })
              )
            );
          case 'summary':
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.get('/listening/summary'))
            );
          case 'refresh':
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.post('/listening/refresh'))
            );
          default:
            return toToolResult(
              fail({
                code: 'invalid_action',
                message: `Unsupported listening action: ${action}`,
                retryable: false,
              })
            );
        }
      },
    },
    { names: [SENDIT_TOOL_NAMES.listening], optional: true }
  );

  // ── sendit_campaigns ─────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.campaigns,
      label: 'SendIt Campaigns',
      description:
        'Multi-post campaign planning and scheduling. ' +
        "Use 'create_plan' with a brief to let AI generate a content calendar. " +
        "Use 'schedule' to activate a planned campaign. Use 'list' to view all campaigns." +
        ' Related: Use sendit_brand_voice to set tone. Check sendit_best_times for optimal scheduling.',
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal('list'),
          Type.Literal('get'),
          Type.Literal('create_plan'),
          Type.Literal('schedule'),
          Type.Literal('delete'),
        ]),
        id: Type.Optional(
          Type.String({ description: 'Campaign ID (required for get, schedule, delete).' })
        ),
        brief: Type.Optional(Type.String({ description: 'Campaign brief for AI planning.' })),
        platforms: Type.Optional(Type.Array(PLATFORM_TYPE)),
        postCount: Type.Optional(Type.Number({ description: 'Target number of posts.' })),
        startDate: Type.Optional(Type.String({ description: 'Campaign start date (ISO 8601).' })),
        endDate: Type.Optional(Type.String({ description: 'Campaign end date (ISO 8601).' })),
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: {
          action: 'list' | 'get' | 'create_plan' | 'schedule' | 'delete';
          id?: string;
          brief?: string;
          platforms?: string[];
          postCount?: number;
          startDate?: string;
          endDate?: string;
        }
      ) => {
        switch (params.action) {
          case 'list':
            return toToolResult(deps.normalizeOutcome(await deps.httpClient.get('/campaigns')));
          case 'get': {
            if (!params.id)
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for campaign get',
                  retryable: false,
                })
              );
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.get(`/campaigns/${params.id}`))
            );
          }
          case 'create_plan': {
            const result = await deps.httpClient.post('/campaigns', {
              body: {
                brief: params.brief,
                platforms: params.platforms,
                postCount: params.postCount,
                startDate: params.startDate,
                endDate: params.endDate,
              },
            });
            return toToolResult(deps.normalizeOutcome(result));
          }
          case 'schedule': {
            if (!params.id) {
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for campaign schedule action',
                  retryable: false,
                })
              );
            }
            const result = await deps.httpClient.post(`/campaigns/${params.id}/schedule`);
            return toToolResult(deps.normalizeOutcome(result));
          }
          case 'delete': {
            if (!params.id)
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for campaign delete',
                  retryable: false,
                })
              );
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.delete(`/campaigns/${params.id}`))
            );
          }
          default:
            return toToolResult(
              fail({
                code: 'invalid_action',
                message: `Unsupported campaign action: ${(params as { action: string }).action}`,
                retryable: false,
              })
            );
        }
      },
    },
    { names: [SENDIT_TOOL_NAMES.campaigns], optional: true }
  );

  // ── sendit_brand_voice ───────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.brandVoice,
      label: 'SendIt Brand Voice',
      description:
        'Manage brand voice profiles that guide AI content generation. ' +
        'Create profiles with tone, vocabulary, and style preferences. ' +
        'Set a default profile that is automatically applied to AI-generated content.' +
        ' Related: Use sendit_ai_generate_post_bundle to generate content in this voice.',
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal('list'),
          Type.Literal('create'),
          Type.Literal('get'),
          Type.Literal('update'),
          Type.Literal('delete'),
          Type.Literal('set_default'),
        ]),
        id: Type.Optional(Type.String({ description: 'Brand voice profile ID.' })),
        name: Type.Optional(Type.String({ description: 'Profile name (required for create).' })),
        tone: Type.Optional(
          Type.String({ description: 'Brand tone: professional, casual, witty, friendly.' })
        ),
        personality: Type.Optional(Type.String({ description: 'Brand personality description.' })),
        writingStyle: Type.Optional(Type.String({ description: 'Writing style guidance.' })),
        doRules: Type.Optional(
          Type.Array(Type.String(), { description: 'Things the voice should do.' })
        ),
        dontRules: Type.Optional(
          Type.Array(Type.String(), { description: 'Things the voice should avoid.' })
        ),
        examplePosts: Type.Optional(
          Type.Array(Type.String(), { description: 'Example posts in this voice.' })
        ),
        approvedHashtags: Type.Optional(
          Type.Array(Type.String(), { description: 'Allowed hashtags.' })
        ),
        bannedWords: Type.Optional(Type.Array(Type.String(), { description: 'Words to avoid.' })),
        keyPhrases: Type.Optional(Type.Array(Type.String(), { description: 'Signature phrases.' })),
        isDefault: Type.Optional(Type.Boolean({ description: 'Set as default profile.' })),
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: {
          action: 'list' | 'create' | 'get' | 'update' | 'delete' | 'set_default';
          id?: string;
          name?: string;
          tone?: string;
          personality?: string;
          writingStyle?: string;
          doRules?: string[];
          dontRules?: string[];
          examplePosts?: string[];
          approvedHashtags?: string[];
          bannedWords?: string[];
          keyPhrases?: string[];
          isDefault?: boolean;
        }
      ) => {
        switch (params.action) {
          case 'list':
            return toToolResult(deps.normalizeOutcome(await deps.httpClient.get('/brand-voice')));
          case 'create': {
            const body: Record<string, unknown> = {};
            for (const key of [
              'name',
              'tone',
              'personality',
              'writingStyle',
              'doRules',
              'dontRules',
              'examplePosts',
              'approvedHashtags',
              'bannedWords',
              'keyPhrases',
              'isDefault',
            ]) {
              if ((params as Record<string, unknown>)[key] !== undefined)
                body[key] = (params as Record<string, unknown>)[key];
            }
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.post('/brand-voice', { body }))
            );
          }
          case 'get': {
            if (!params.id)
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for brand_voice get',
                  retryable: false,
                })
              );
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.get(`/brand-voice/${params.id}`))
            );
          }
          case 'update': {
            if (!params.id)
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for brand_voice update',
                  retryable: false,
                })
              );
            const body: Record<string, unknown> = {};
            for (const key of [
              'name',
              'tone',
              'personality',
              'writingStyle',
              'doRules',
              'dontRules',
              'examplePosts',
              'approvedHashtags',
              'bannedWords',
              'keyPhrases',
              'isDefault',
            ]) {
              if ((params as Record<string, unknown>)[key] !== undefined)
                body[key] = (params as Record<string, unknown>)[key];
            }
            return toToolResult(
              deps.normalizeOutcome(
                await deps.httpClient.patch(`/brand-voice/${params.id}`, { body })
              )
            );
          }
          case 'delete': {
            if (!params.id)
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for brand_voice delete',
                  retryable: false,
                })
              );
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.delete(`/brand-voice/${params.id}`))
            );
          }
          case 'set_default': {
            if (!params.id)
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for brand_voice set_default',
                  retryable: false,
                })
              );
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.post(`/brand-voice/${params.id}/default`))
            );
          }
          default:
            return toToolResult(
              fail({
                code: 'invalid_action',
                message: `Unsupported brand_voice action: ${(params as { action: string }).action}`,
                retryable: false,
              })
            );
        }
      },
    },
    { names: [SENDIT_TOOL_NAMES.brandVoice], optional: true }
  );

  // ── sendit_content_library ───────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.contentLibrary,
      label: 'SendIt Content Library',
      description:
        'Save, organize, and retrieve reusable content pieces. ' +
        'Store post templates, evergreen content, and media assets. ' +
        'Retrieve saved content to quickly publish across platforms.' +
        ' Related: Use sendit_publish to post directly. Use sendit_ai_critique_post to evaluate quality.',
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal('list'),
          Type.Literal('get'),
          Type.Literal('save'),
          Type.Literal('update'),
          Type.Literal('delete'),
          Type.Literal('publish'),
        ]),
        id: Type.Optional(Type.String({ description: 'Library item ID.' })),
        title: Type.Optional(Type.String({ description: 'Item title (required for save).' })),
        text: Type.Optional(Type.String({ description: 'Content text (required for save).' })),
        contentType: Type.Optional(
          Type.Union([Type.Literal('draft'), Type.Literal('template'), Type.Literal('evergreen')], {
            description: 'Content type (default: draft).',
          })
        ),
        mediaUrl: Type.Optional(Type.String({ description: 'Media attachment URL.' })),
        category: Type.Optional(Type.String({ description: 'Organizational category.' })),
        tags: Type.Optional(Type.Array(Type.String(), { description: 'Tags for filtering.' })),
        targetPlatforms: Type.Optional(
          Type.Array(PLATFORM_TYPE, { description: 'Target platforms for this content.' })
        ),
        evergreenEnabled: Type.Optional(
          Type.Boolean({ description: 'Enable evergreen recycling.' })
        ),
        evergreenIntervalDays: Type.Optional(
          Type.Number({ description: 'Days between republishes (default: 30).' })
        ),
        platforms: Type.Optional(
          Type.Array(PLATFORM_TYPE, {
            description: 'Target platforms (required for publish action).',
          })
        ),
        ...PAGINATION_PARAMS,
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: {
          action: 'list' | 'get' | 'save' | 'update' | 'delete' | 'publish';
          id?: string;
          title?: string;
          text?: string;
          contentType?: string;
          mediaUrl?: string;
          category?: string;
          tags?: string[];
          targetPlatforms?: string[];
          evergreenEnabled?: boolean;
          evergreenIntervalDays?: number;
          platforms?: string[];
          limit?: number;
          offset?: number;
        }
      ) => {
        switch (params.action) {
          case 'list':
            return toToolResult(
              deps.normalizeOutcome(
                await deps.httpClient.get('/library', {
                  query: { limit: params.limit, offset: params.offset },
                })
              )
            );
          case 'get': {
            if (!params.id)
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for content_library get',
                  retryable: false,
                })
              );
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.get(`/library/${params.id}`))
            );
          }
          case 'save': {
            const body: Record<string, unknown> = {};
            for (const key of [
              'title',
              'text',
              'contentType',
              'mediaUrl',
              'category',
              'tags',
              'targetPlatforms',
              'evergreenEnabled',
              'evergreenIntervalDays',
            ]) {
              if ((params as Record<string, unknown>)[key] !== undefined)
                body[key] = (params as Record<string, unknown>)[key];
            }
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.post('/library', { body }))
            );
          }
          case 'update': {
            if (!params.id)
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for content_library update',
                  retryable: false,
                })
              );
            const body: Record<string, unknown> = {};
            for (const key of [
              'title',
              'text',
              'contentType',
              'mediaUrl',
              'category',
              'tags',
              'targetPlatforms',
              'evergreenEnabled',
              'evergreenIntervalDays',
            ]) {
              if ((params as Record<string, unknown>)[key] !== undefined)
                body[key] = (params as Record<string, unknown>)[key];
            }
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.patch(`/library/${params.id}`, { body }))
            );
          }
          case 'delete': {
            if (!params.id)
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for content_library delete',
                  retryable: false,
                })
              );
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.delete(`/library/${params.id}`))
            );
          }
          case 'publish': {
            if (!params.id)
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for content_library publish',
                  retryable: false,
                })
              );
            if (!params.platforms?.length)
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'platforms are required for content_library publish',
                  retryable: false,
                })
              );
            return toToolResult(
              deps.normalizeOutcome(
                await deps.httpClient.post(`/library/${params.id}/publish`, {
                  body: { platforms: params.platforms },
                })
              )
            );
          }
          default:
            return toToolResult(
              fail({
                code: 'invalid_action',
                message: `Unsupported content_library action: ${(params as { action: string }).action}`,
                retryable: false,
              })
            );
        }
      },
    },
    { names: [SENDIT_TOOL_NAMES.contentLibrary], optional: true }
  );

  // ── sendit_approvals ─────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.approvals,
      label: 'SendIt Approvals',
      description:
        'Manage content approval workflows. List pending posts awaiting review, approve or reject them. ' +
        'Required when team approval policies are enabled for publishing.' +
        ' Related: Use sendit_schedule to create content that enters approval flow.',
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal('list_pending'),
          Type.Literal('approve'),
          Type.Literal('reject'),
        ]),
        id: Type.Optional(
          Type.String({ description: 'Approval request ID (required for approve/reject).' })
        ),
        reason: Type.Optional(Type.String({ description: 'Reason for rejection.' })),
        ...PAGINATION_PARAMS,
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: {
          action: 'list_pending' | 'approve' | 'reject';
          id?: string;
          reason?: string;
          limit?: number;
          offset?: number;
        }
      ) => {
        switch (params.action) {
          case 'list_pending':
            return toToolResult(
              deps.normalizeOutcome(
                await deps.httpClient.get('/approvals', {
                  query: { limit: params.limit, offset: params.offset },
                })
              )
            );
          case 'approve': {
            if (!params.id) {
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for approve',
                  retryable: false,
                })
              );
            }
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.post(`/approvals/${params.id}/approve`))
            );
          }
          case 'reject': {
            if (!params.id) {
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for reject',
                  retryable: false,
                })
              );
            }
            return toToolResult(
              deps.normalizeOutcome(
                await deps.httpClient.post(`/approvals/${params.id}/reject`, {
                  body: { reason: params.reason },
                })
              )
            );
          }
          default:
            return toToolResult(
              fail({
                code: 'invalid_action',
                message: `Unsupported approvals action: ${(params as { action: string }).action}`,
                retryable: false,
              })
            );
        }
      },
    },
    { names: [SENDIT_TOOL_NAMES.approvals], optional: true }
  );

  // ── sendit_dead_letter ───────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.deadLetter,
      label: 'SendIt Dead Letter',
      description:
        'View and retry failed publish attempts. ' +
        'Posts that fail due to transient errors (rate limits, timeouts) can be requeued for another attempt.' +
        ' Related: Use sendit_list_scheduled to check the current queue.',
      parameters: Type.Object({
        action: Type.Union([Type.Literal('list'), Type.Literal('requeue')]),
        id: Type.Optional(
          Type.String({ description: 'Dead letter entry ID (required for requeue).' })
        ),
        ...PAGINATION_PARAMS,
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: { action: 'list' | 'requeue'; id?: string; limit?: number; offset?: number }
      ) => {
        if (params.action === 'list') {
          return toToolResult(
            deps.normalizeOutcome(
              await deps.httpClient.get('/dead-letter', {
                query: { limit: params.limit, offset: params.offset },
              })
            )
          );
        }
        if (!params.id) {
          return toToolResult(
            fail({ code: 'invalid_input', message: 'id is required for requeue', retryable: false })
          );
        }
        return toToolResult(
          deps.normalizeOutcome(await deps.httpClient.post(`/dead-letter/${params.id}/requeue`))
        );
      },
    },
    { names: [SENDIT_TOOL_NAMES.deadLetter], optional: true }
  );

  // ── sendit_bulk_schedule ─────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.bulkSchedule,
      label: 'SendIt Bulk Schedule',
      description:
        'Schedule multiple posts at once via CSV import. ' +
        "Use 'get_template' for the expected CSV format, 'validate' to check before importing, and 'import' to create posts." +
        ' Related: Use sendit_validate to check content before import.',
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal('get_template'),
          Type.Literal('validate'),
          Type.Literal('import'),
        ]),
        csvData: Type.Optional(
          Type.String({ description: 'CSV content for validate/import actions.' })
        ),
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: { action: 'get_template' | 'validate' | 'import'; csvData?: string }
      ) => {
        if (params.action === 'get_template') {
          return toToolResult(
            deps.normalizeOutcome(await deps.httpClient.post('/bulk-schedule/template'))
          );
        }
        if (!params.csvData) {
          return toToolResult(
            fail({
              code: 'invalid_input',
              message: 'csvData is required for validate/import',
              retryable: false,
            })
          );
        }
        if (params.action === 'validate') {
          return toToolResult(
            deps.normalizeOutcome(
              await deps.httpClient.post('/bulk-schedule/validate', {
                body: { csv: params.csvData },
              })
            )
          );
        }
        return toToolResult(
          deps.normalizeOutcome(
            await deps.httpClient.post('/bulk-schedule/import', { body: { csv: params.csvData } })
          )
        );
      },
    },
    { names: [SENDIT_TOOL_NAMES.bulkSchedule], optional: true }
  );

  // ── sendit_webhooks ──────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.webhooks,
      label: 'SendIt Webhooks',
      description:
        'Manage webhook subscriptions for SendIt events (post published, scheduled, failed, etc.). ' +
        "Use 'events_catalog' to discover available event types." +
        ' Related: Use sendit_audit_log to review event history.',
      parameters: Type.Object({
        action: Type.Union([
          Type.Literal('list'),
          Type.Literal('create'),
          Type.Literal('delete'),
          Type.Literal('test'),
          Type.Literal('events_catalog'),
        ]),
        id: Type.Optional(Type.String({ description: 'Webhook ID (for delete/test).' })),
        url: Type.Optional(
          Type.String({ description: 'Webhook endpoint URL (required for create).' })
        ),
        events: Type.Optional(
          Type.Array(Type.String(), {
            description:
              'Event types to subscribe to. Use events_catalog action to discover available types.',
          })
        ),
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: {
          action: 'list' | 'create' | 'delete' | 'test' | 'events_catalog';
          id?: string;
          url?: string;
          events?: string[];
        }
      ) => {
        switch (params.action) {
          case 'list':
            return toToolResult(deps.normalizeOutcome(await deps.httpClient.get('/webhooks')));
          case 'create':
            return toToolResult(
              deps.normalizeOutcome(
                await deps.httpClient.post('/webhooks', {
                  body: { url: params.url, events: params.events },
                })
              )
            );
          case 'events_catalog':
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.get('/webhooks/events-catalog'))
            );
          case 'delete': {
            if (!params.id) {
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for webhook delete',
                  retryable: false,
                })
              );
            }
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.delete(`/webhooks/${params.id}`))
            );
          }
          case 'test': {
            if (!params.id) {
              return toToolResult(
                fail({
                  code: 'invalid_input',
                  message: 'id is required for webhook test',
                  retryable: false,
                })
              );
            }
            return toToolResult(
              deps.normalizeOutcome(await deps.httpClient.post(`/webhooks/${params.id}/test`))
            );
          }
          default:
            return toToolResult(
              fail({
                code: 'invalid_action',
                message: `Unsupported webhook action: ${(params as { action: string }).action}`,
                retryable: false,
              })
            );
        }
      },
    },
    { names: [SENDIT_TOOL_NAMES.webhooks], optional: true }
  );

  // ── sendit_audit_log ─────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.auditLog,
      label: 'SendIt Audit Log',
      description:
        'Query the activity audit trail. Shows who did what and when — publish events, account connections, ' +
        'approval decisions, and configuration changes. Useful for compliance and debugging.' +
        ' Related: Use sendit_approvals to review pending content.',
      parameters: Type.Object({
        action: Type.Optional(
          Type.String({
            description: "Filter by action type (e.g., 'publish', 'connect', 'approve').",
          })
        ),
        userId: Type.Optional(Type.String({ description: 'Filter by user ID.' })),
        since: Type.Optional(Type.String({ description: 'ISO 8601 start date.' })),
        until: Type.Optional(Type.String({ description: 'ISO 8601 end date.' })),
        ...PAGINATION_PARAMS,
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: {
          action?: string;
          userId?: string;
          since?: string;
          until?: string;
          limit?: number;
          offset?: number;
        }
      ) => {
        return toToolResult(
          deps.normalizeOutcome(
            await deps.httpClient.get('/audit-log', {
              query: {
                action: params.action,
                user_id: params.userId,
                since: params.since,
                until: params.until,
                limit: params.limit,
                offset: params.offset,
              },
            })
          )
        );
      },
    },
    { names: [SENDIT_TOOL_NAMES.auditLog], optional: true }
  );

  // ── sendit_ai_media ──────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.aiMedia,
      label: 'SendIt AI Media Generation',
      description:
        'Generate images and videos using AI (Sora, Runway, Pika, Adobe Express). ' +
        "Use 'generate' to start a job and 'status' to poll progress. " +
        'Completed media URLs can be used directly in content.mediaUrl.' +
        ' Related: Use sendit_upload_media to register generated media. Use sendit_publish to post.',
      parameters: Type.Object({
        action: Type.Union([Type.Literal('generate'), Type.Literal('status')]),
        jobId: Type.Optional(
          Type.String({ description: 'Job ID from a generate call (required for status).' })
        ),
        provider: Type.Optional(
          Type.Union(
            [
              Type.Literal('sora'),
              Type.Literal('runway'),
              Type.Literal('pika'),
              Type.Literal('adobe-express'),
            ],
            { description: 'AI provider (required for generate).' }
          )
        ),
        prompt: Type.Optional(
          Type.String({ description: 'Generation prompt (required for generate).' })
        ),
        media_type: Type.Optional(
          Type.Union([Type.Literal('image'), Type.Literal('video')], {
            description: 'Output media type (default: video).',
          })
        ),
        parameters: Type.Optional(
          Type.Object(
            {},
            { additionalProperties: true, description: 'Provider-specific parameters.' }
          )
        ),
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: {
          action: 'generate' | 'status';
          jobId?: string;
          provider?: string;
          prompt?: string;
          media_type?: string;
          parameters?: Record<string, unknown>;
        }
      ) => {
        if (params.action === 'generate') {
          const body: Record<string, unknown> = {};
          for (const key of ['provider', 'prompt', 'media_type', 'parameters']) {
            if ((params as Record<string, unknown>)[key] !== undefined)
              body[key] = (params as Record<string, unknown>)[key];
          }
          return toToolResult(
            deps.normalizeOutcome(await deps.httpClient.post('/media/ai-generate', { body }))
          );
        }
        if (!params.jobId) {
          return toToolResult(
            fail({
              code: 'invalid_input',
              message: 'jobId is required for status action',
              retryable: false,
            })
          );
        }
        return toToolResult(
          deps.normalizeOutcome(await deps.httpClient.get(`/media/ai-generate/${params.jobId}`))
        );
      },
    },
    { names: [SENDIT_TOOL_NAMES.aiMedia], optional: true }
  );

  // ── sendit_best_times ────────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.bestTimes,
      label: 'SendIt Best Times to Post',
      description:
        'Get AI-recommended optimal posting times for a platform based on historical engagement data. ' +
        'Returns hour-by-hour engagement scores and recommended posting windows. ' +
        'Use these times when scheduling content for maximum reach.' +
        ' Related: Use sendit_schedule with the recommended times.',
      parameters: Type.Object({
        platform: PLATFORM_TYPE,
        ...TEAM_ID_PARAM,
      }),
      execute: async (_toolCallId: string, params: { platform: string }) => {
        return toToolResult(
          deps.normalizeOutcome(
            await deps.httpClient.get('/best-times', { query: { platform: params.platform } })
          )
        );
      },
    },
    { names: [SENDIT_TOOL_NAMES.bestTimes], optional: true }
  );

  // ── sendit_content_score ─────────────────────────────────────────
  api.registerTool(
    {
      name: SENDIT_TOOL_NAMES.contentScore,
      label: 'SendIt Content Score',
      description:
        'Score content quality before publishing. Returns a 0-100 score with breakdown by ' +
        'engagement prediction, readability, hashtag effectiveness, and platform fit. ' +
        'Use to compare draft variants and pick the highest-scoring one.' +
        ' Related: Use sendit_ai_critique_post for detailed suggestions. Use sendit_ai_generate_post_bundle for alternatives.',
      parameters: Type.Object({
        platforms: Type.Array(PLATFORM_TYPE, { minItems: 1 }),
        text: Type.String({ description: 'Content text to score.' }),
        mediaUrl: Type.Optional(Type.String({ description: 'Media URL to include in scoring.' })),
        ...TEAM_ID_PARAM,
      }),
      execute: async (
        _toolCallId: string,
        params: { platforms: string[]; text: string; mediaUrl?: string }
      ) => {
        return toToolResult(
          deps.normalizeOutcome(
            await deps.httpClient.post('/content-score', {
              body: { platforms: params.platforms, text: params.text, mediaUrl: params.mediaUrl },
            })
          )
        );
      },
    },
    { names: [SENDIT_TOOL_NAMES.contentScore], optional: true }
  );
}
