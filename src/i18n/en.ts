/**
 * English (canonical) locale strings for the SendIt OpenClaw plugin.
 * All tool descriptions and error messages are keyed here.
 * Other locales should mirror these keys.
 */
export const en = {
  // ── Error messages ──────────────────────────────────────────────────
  'errors.rate_limited':
    "Rate limited. Wait a moment and retry, or check your API tier's rate limits via sendit_capabilities.",
  'errors.server_error':
    "Internal server error. If this persists, run 'openclaw sendit doctor' to check connectivity.",
  'errors.service_unavailable':
    'SendIt service is temporarily unavailable. Retry in a few seconds.',
  'errors.unauthorized_api_key':
    "Run 'openclaw sendit auth login --mode api-key' to re-authenticate.",
  'errors.unauthorized_oauth': "Run 'openclaw sendit auth login --mode oauth' to re-authenticate.",
  'errors.forbidden': 'Check that your API key tier supports this feature.',
  'errors.not_found': 'Verify the resource ID exists using the corresponding list tool.',
  'errors.file_not_found': 'File not found at path: {path}',
  'errors.permission_denied': 'Permission denied: {path}',
  'errors.restricted_path': 'Path is in a restricted directory: {path}',
  'errors.invalid_action': 'Unsupported {tool} action: {action}',
  'errors.invalid_input': '{message}',
  'errors.mcp_disabled': 'MCP bridge is disabled in plugin config (mcp.enabled=false).',
  'errors.mcp_tool_unavailable':
    "MCP tool '{tool}' is unavailable. Use sendit_capabilities to verify active tools.",

  // ── Plugin meta ─────────────────────────────────────────────────────
  'plugin.registered': '[sendit] plugin registered',
  'plugin.disabled': '[sendit] plugin is disabled in config (enabled=false)',
  'plugin.mcp_probe_complete': '[sendit] MCP probe complete ({count} tools discovered)',
  'plugin.capabilities_failed': '[sendit] Capabilities probe failed: {message}',
} as const;

export type MessageKey = keyof typeof en;
