# @senditapp/openclaw

Official SendIt plugin for [OpenClaw](https://docs.openclaw.ai/) with a hybrid model:

- REST-first tools for core publishing and growth operations
- MCP bridge tools for advanced AI workflows
- Dual auth support: API key and OAuth
- Bundled `sendit-openclaw` skill pack
- Auto-schema discovery and runtime validation
- Multi-tenant team switching per tool call
- i18n support (English + Spanish)

## Install

```bash
openclaw plugins install clawhub:@senditapp/openclaw@0.2.0
```

Tested host: OpenClaw `2026.9.6`.
Use Node `24.16+` (Node 24) or Node `26.1+`.
The package declares the same Node requirements as that host.

[OpenClaw plugin APIs are experimental](https://docs.openclaw.ai/plugins/building-plugins), so this package pins its development host and verifies the packed installation on CI.

The ClawHub package passed its scan and was installed with all 41 tools in OpenClaw 2026.9.6.
The [GitHub release archive](https://github.com/Shree-git/sendit-openclaw/releases/tag/v0.2.0) is also public.
The npm release remains pending publisher authentication.

## Quick start

1. Configure auth:

```bash
# API key path
openclaw sendit auth login --mode api-key

# OAuth path
openclaw sendit auth login --mode oauth
openclaw models auth login --provider sendit
```

2. Allow the optional tools you want to use.
Merge this into your existing OpenClaw config:

```json
{
  "tools": { "alsoAllow": ["sendit"] }
}
```

The plugin registers 41 tools.
Seven read-only tools are required; the remaining tools need an allowlist entry.
Use individual tool names instead of `sendit` if you want to allow only selected tools.

3. Validate setup:

```bash
openclaw sendit auth status
openclaw sendit doctor
```

4. Or use the diagnostic tool directly:

```
sendit_status
```

## Environment variables

| Variable                  | Description                                                      |
| ------------------------- | ---------------------------------------------------------------- |
| `SENDIT_API_KEY`          | Primary API key (highest precedence)                             |
| `OPENCLAW_SENDIT_API_KEY` | Alternative API key env var                                      |
| `SENDIT_BASE_URL`         | Override base URL (default: `https://sendit.infiniteappsai.com`) |

## Tool surface (41 tools)

### Core (16)

- `sendit_capabilities` - Discover features, platforms, tool capabilities
- `sendit_list_accounts` - List connected social accounts
- `sendit_connect_account` - Get OAuth URL to connect a platform
- `sendit_requirements` - Get platform content requirements
- `sendit_validate` - Validate content against platform constraints
- `sendit_upload_media` - Upload local file or register media URL
- `sendit_publish` - Publish content immediately
- `sendit_schedule` - Schedule content for future publish
- `sendit_list_scheduled` - List pending scheduled posts
- `sendit_trigger_scheduled` - Publish a scheduled post immediately
- `sendit_delete_scheduled` - Cancel a scheduled post
- `sendit_delete_post` - Delete a published post (permanent)
- `sendit_preview` - Preview content rendering before publishing
- `sendit_analytics` - Fetch per-platform engagement analytics
- `sendit_status` - Diagnostic health check (auth, accounts, MCP, API)
- `sendit_help` - Discover tools and find the right one for your task

### Growth (13)

- `sendit_inbox` - Unified inbox: list, get, reply, update_status
- `sendit_listening` - Social listening: keywords, mentions, alerts, summary
- `sendit_campaigns` - Campaign planning: list, get, create_plan, schedule, delete
- `sendit_brand_voice` - Brand voice profiles: CRUD + set_default
- `sendit_content_library` - Content library: save, organize, retrieve, publish
- `sendit_approvals` - Approval workflows: list_pending, approve, reject
- `sendit_dead_letter` - Failed post recovery: list, requeue
- `sendit_bulk_schedule` - Bulk CSV scheduling: template, validate, import
- `sendit_webhooks` - Webhook management: CRUD, test, events_catalog
- `sendit_audit_log` - Activity audit trail with filters
- `sendit_ai_media` - AI media generation: generate, status
- `sendit_best_times` - AI-recommended optimal posting times
- `sendit_content_score` - Content quality scoring (0-100)

### Advanced MCP (12)

- `sendit_ai_draft_reply` - AI-drafted reply for mentions
- `sendit_ai_summarize_mentions` - Mention clustering and summarization
- `sendit_ai_generate_post_bundle` - Multi-variant post generation
- `sendit_ai_critique_post` - AI critique and scoring for drafts
- `sendit_unified_analytics` - Cross-platform analytics: query, create_report, get_attribution
- `sendit_anomaly_alerts` - Engagement anomaly detection
- `sendit_benchmark` - Industry benchmark comparisons
- `sendit_ads` - Ad campaigns: accounts, campaigns, creatives, performance
- `sendit_crm` - Social CRM: conversations, replies, escalation
- `sendit_agents` - AI agent orchestration: invoke, monitor, policies
- `sendit_workflows` - Workflow automation: create, trigger, monitor
- `sendit_connectors` - External integrations: connect, health, execute

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
- `locale` (`en`, `es`)

## Troubleshooting

| Problem                      | Solution                                                    |
| ---------------------------- | ----------------------------------------------------------- |
| Auth fails                   | Run `openclaw sendit doctor` or call `sendit_status`        |
| MCP tools return unavailable | Check `mcp.enabled` in config, verify API tier supports MCP |
| Rate limited (429)           | Check API key tier, reduce request frequency                |
| Tool not found               | Call `sendit_capabilities` to verify feature availability   |
| Wrong team context           | Pass `teamId` parameter to override per-call                |

## Skills

The plugin bundles `skills/sendit-openclaw/SKILL.md`.
Install the workflow skill separately with [ClawHub](https://docs.openclaw.ai/clawhub/cli):

```bash
clawhub skill install sendit-openclaw
```

The skill requires this plugin; installing a skill does not install the runtime tools.

## Development and release

```bash
npm ci
npm run lint
npm test
npm run test:install
npm pack --dry-run
```

`test:install` packs the built plugin, installs it through OpenClaw's managed `npm-pack:` path in an isolated state directory, and checks all 41 tools and the CLI.
It clears inherited SendIt credentials for the test.
The package build cleans stale output, and the published package excludes test files.
Registration is synchronous and performs no network requests.
The MCP bridge discovers server capabilities on first use.

```bash
npm publish --access public
clawhub skill publish "$PWD/skills/sendit-openclaw" \
  --slug sendit-openclaw --name "SendIt OpenClaw" \
  --version 0.2.0 --dry-run
```

The public source is [Shree-git/sendit-openclaw](https://github.com/Shree-git/sendit-openclaw).
Use the absolute skill path because the ClawHub CLI can have a configured work directory.
Omit `--dry-run` after the preview passes to publish the skill.

## License

MIT
