export const SENDIT_PLUGIN_ID = 'sendit';
export const SENDIT_PLUGIN_VERSION = '0.2.0';
export const SENDIT_SKILL_PACK = 'sendit-openclaw';

export const SENDIT_TOOL_NAMES = {
  // ── Core (16) ──────────────────────────────────────────────────────
  capabilities: 'sendit_capabilities',
  listAccounts: 'sendit_list_accounts',
  connectAccount: 'sendit_connect_account',
  requirements: 'sendit_requirements',
  validate: 'sendit_validate',
  uploadMedia: 'sendit_upload_media',
  publish: 'sendit_publish',
  schedule: 'sendit_schedule',
  listScheduled: 'sendit_list_scheduled',
  triggerScheduled: 'sendit_trigger_scheduled',
  deleteScheduled: 'sendit_delete_scheduled',
  deletePost: 'sendit_delete_post',
  preview: 'sendit_preview',
  analytics: 'sendit_analytics',
  status: 'sendit_status',
  help: 'sendit_help',

  // ── Growth (13) ────────────────────────────────────────────────────
  inbox: 'sendit_inbox',
  listening: 'sendit_listening',
  campaigns: 'sendit_campaigns',
  brandVoice: 'sendit_brand_voice',
  contentLibrary: 'sendit_content_library',
  approvals: 'sendit_approvals',
  deadLetter: 'sendit_dead_letter',
  bulkSchedule: 'sendit_bulk_schedule',
  webhooks: 'sendit_webhooks',
  auditLog: 'sendit_audit_log',
  aiMedia: 'sendit_ai_media',
  bestTimes: 'sendit_best_times',
  contentScore: 'sendit_content_score',

  // ── Advanced MCP (12) ─────────────────────────────────────────────
  aiDraftReply: 'sendit_ai_draft_reply',
  aiSummarizeMentions: 'sendit_ai_summarize_mentions',
  aiGeneratePostBundle: 'sendit_ai_generate_post_bundle',
  aiCritiquePost: 'sendit_ai_critique_post',
  unifiedAnalytics: 'sendit_unified_analytics',
  anomalyAlerts: 'sendit_anomaly_alerts',
  benchmark: 'sendit_benchmark',
  ads: 'sendit_ads',
  crm: 'sendit_crm',
  agents: 'sendit_agents',
  workflows: 'sendit_workflows',
  connectors: 'sendit_connectors',
} as const;

export type SendItToolName = (typeof SENDIT_TOOL_NAMES)[keyof typeof SENDIT_TOOL_NAMES];

export const SENDIT_PLATFORM_ENUM = [
  'x',
  'linkedin',
  'linkedin-page',
  'facebook',
  'instagram',
  'threads',
  'bluesky',
  'mastodon',
  'nostr',
  'youtube',
  'tiktok',
  'lemmy',
  'discord',
  'slack',
  'telegram',
  'pinterest',
  'dribbble',
  'devto',
  'hashnode',
  'gmb',
  'whop',
  'producthunt',
] as const;

export type SendItPlatform = (typeof SENDIT_PLATFORM_ENUM)[number];
