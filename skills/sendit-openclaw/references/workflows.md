# SendIt OpenClaw References

## Tool Groups

- Core publishing: `sendit_publish`, `sendit_schedule`, `sendit_validate`, `sendit_upload_media`
- Scheduling control: `sendit_list_scheduled`, `sendit_trigger_scheduled`, `sendit_delete_scheduled`
- Growth operations: `sendit_inbox`, `sendit_listening`, `sendit_campaigns`, `sendit_brand_voice`
- AI optimization: `sendit_ai_draft_reply`, `sendit_ai_summarize_mentions`, `sendit_ai_generate_post_bundle`, `sendit_ai_critique_post`

## Auth Paths

- API key path: `openclaw sendit auth login --mode api-key --api-key sk_live_xxx`
- OAuth path: `openclaw sendit auth login --mode oauth` then `openclaw models auth login --provider sendit`

## Health Checks

- `openclaw sendit auth status`
- `openclaw sendit doctor`
