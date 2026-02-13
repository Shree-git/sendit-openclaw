# @sendit/openclaw

Official SendIt plugin for [OpenClaw](https://docs.openclaw.ai/) with a hybrid model:

- REST-first tools for core publishing and growth operations
- MCP bridge tools for advanced AI workflows
- Dual auth support: API key and OAuth
- Bundled `sendit-openclaw` skill pack

## Install

```bash
openclaw plugins install @sendit/openclaw
```

OpenClaw compatibility target: `>=2026.2.13`.

## Quick Start

1. Configure auth:

```bash
# API key path
openclaw sendit auth login --mode api-key --api-key sk_live_xxx

# OAuth path
openclaw sendit auth login --mode oauth
openclaw models auth login --provider sendit
```

2. Validate setup:

```bash
openclaw sendit auth status
openclaw sendit doctor
```

## Tool Surface

Core tools:

- `sendit_capabilities`
- `sendit_list_accounts`
- `sendit_connect_account`
- `sendit_requirements`
- `sendit_validate`
- `sendit_upload_media`
- `sendit_publish`
- `sendit_schedule`
- `sendit_list_scheduled`
- `sendit_trigger_scheduled`
- `sendit_delete_scheduled`
- `sendit_analytics`

Growth tools (action-based):

- `sendit_inbox`
- `sendit_listening`
- `sendit_campaigns`
- `sendit_brand_voice`

Advanced MCP tools:

- `sendit_ai_draft_reply`
- `sendit_ai_summarize_mentions`
- `sendit_ai_generate_post_bundle`
- `sendit_ai_critique_post`

## Config

Plugin config lives under `plugins.entries.sendit.config`.

Supported fields:

- `enabled`
- `baseUrl`
- `auth.mode` (`auto`, `api_key`, `oauth`)
- `auth.apiKey`
- `auth.oauth.*`
- `teamId`
- `timeouts.requestMs`, `timeouts.mcpMs`
- `retries.max`, `retries.backoffMs`
- `mcp.enabled`, `mcp.endpoint`
- `telemetry.enabled`

## Skills

The plugin bundles `skills/sendit-openclaw/SKILL.md` and can also be installed from ClawHub as `sendit-openclaw`.

## License

MIT

## Canonical Mirror Setup

This repository is the canonical source. Snapshot mirrors are opened as PRs into:

- `Shree-git/sendit`
- `integrations/openclaw-plugin/`
- `integrations/clawhub-skill-pack/sendit-openclaw/`

Required GitHub secret in this repo:

- `SENDIT_MONOREPO_TOKEN` with `repo` scope for the target monorepo.
