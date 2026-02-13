---
name: sendit-openclaw
description: Execute SendIt social publishing workflows in OpenClaw using the official @sendit/openclaw plugin tools.
metadata:
  openclaw:
    skillKey: sendit-openclaw
    requires:
      config:
        - plugins.entries.sendit.enabled
    install:
      - id: sendit-plugin
        kind: npm
        package: "@sendit/openclaw"
        label: Install @sendit/openclaw
---

# SendIt OpenClaw Orchestrator

Use only prefixed SendIt plugin tools from `@sendit/openclaw`.

## Workflow 1: Connect Accounts

1. Call `sendit_capabilities`.
2. Call `sendit_list_accounts`.
3. For each missing platform call `sendit_connect_account` with `platform`.
4. Ask user to complete OAuth URLs.
5. Re-run `sendit_list_accounts` and confirm connected state.

## Workflow 2: Publish Or Schedule

1. Call `sendit_validate` with `platforms` and `content`.
2. If local media is present call `sendit_upload_media` first.
3. For immediate posting call `sendit_publish`.
4. For delayed posting call `sendit_schedule`.
5. If needed call `sendit_list_scheduled`, `sendit_trigger_scheduled`, or `sendit_delete_scheduled`.

## Workflow 3: Inbox + Listening Loop

1. Call `sendit_inbox` with `action="list"`.
2. For thread follow-ups call `sendit_inbox` with `action="get"`.
3. For replies call `sendit_inbox` with `action="reply"`.
4. Monitor listening data with `sendit_listening` actions (`list_mentions`, `list_alerts`, `summary`).
5. Keep hygiene with `sendit_listening` actions `mark_mentions_read`, `archive_mentions`, `mark_alerts_read`, and `dismiss_alerts`.

## Workflow 4: Campaign Planning

1. Call `sendit_campaigns` with `action="create_plan"`.
2. Inspect outputs via `sendit_campaigns` with `action="list"`.
3. Schedule selected campaign with `sendit_campaigns` and `action="schedule"`.
4. Validate execution through `sendit_list_scheduled` and `sendit_analytics`.

## Workflow 5: Advanced AI Optimization

1. Use `sendit_ai_generate_post_bundle` to generate variants.
2. Use `sendit_ai_critique_post` to score a candidate draft.
3. Use `sendit_ai_summarize_mentions` to capture audience themes.
4. Use `sendit_ai_draft_reply` to draft sensitive mention responses.
5. Publish finalized content with `sendit_publish` or `sendit_schedule`.

## Guardrails

- Do not call unprefixed SendIt MCP tools directly.
- Validate before writing when uncertain.
- Prefer `sendit_capabilities` when behavior differs across environments.
- If a MCP AI tool returns unavailable, proceed with REST-core workflows and surface the fallback reason.
