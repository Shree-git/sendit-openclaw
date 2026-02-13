export const SENDIT_PLUGIN_ID = "sendit";
export const SENDIT_PLUGIN_VERSION = "0.1.0";
export const SENDIT_SKILL_PACK = "sendit-openclaw";

export const SENDIT_TOOL_NAMES = {
  capabilities: "sendit_capabilities",
  listAccounts: "sendit_list_accounts",
  connectAccount: "sendit_connect_account",
  requirements: "sendit_requirements",
  validate: "sendit_validate",
  uploadMedia: "sendit_upload_media",
  publish: "sendit_publish",
  schedule: "sendit_schedule",
  listScheduled: "sendit_list_scheduled",
  triggerScheduled: "sendit_trigger_scheduled",
  deleteScheduled: "sendit_delete_scheduled",
  analytics: "sendit_analytics",
  inbox: "sendit_inbox",
  listening: "sendit_listening",
  campaigns: "sendit_campaigns",
  brandVoice: "sendit_brand_voice",
  aiDraftReply: "sendit_ai_draft_reply",
  aiSummarizeMentions: "sendit_ai_summarize_mentions",
  aiGeneratePostBundle: "sendit_ai_generate_post_bundle",
  aiCritiquePost: "sendit_ai_critique_post",
} as const;

export type SendItToolName =
  (typeof SENDIT_TOOL_NAMES)[keyof typeof SENDIT_TOOL_NAMES];

export const SENDIT_PLATFORM_ENUM = [
  "x",
  "linkedin",
  "linkedin-page",
  "facebook",
  "instagram",
  "instagram-standalone",
  "threads",
  "bluesky",
  "mastodon",
  "warpcast",
  "nostr",
  "vk",
  "youtube",
  "tiktok",
  "reddit",
  "lemmy",
  "discord",
  "slack",
  "telegram",
  "pinterest",
  "dribbble",
  "medium",
  "devto",
  "hashnode",
  "wordpress",
  "gmb",
  "listmonk",
  "skool",
  "whop",
  "kick",
  "twitch",
  "producthunt",
] as const;

export type SendItPlatform = (typeof SENDIT_PLATFORM_ENUM)[number];
