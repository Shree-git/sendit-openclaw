/**
 * Spanish locale strings for the SendIt OpenClaw plugin.
 * Proof of concept — covers error messages and plugin meta.
 */
export const es: Record<string, string> = {
  // ── Error messages ──────────────────────────────────────────────────
  'errors.rate_limited':
    'Límite de velocidad alcanzado. Espere un momento y vuelva a intentar, o verifique los límites de su plan via sendit_capabilities.',
  'errors.server_error':
    "Error interno del servidor. Si persiste, ejecute 'openclaw sendit doctor' para verificar la conectividad.",
  'errors.service_unavailable':
    'El servicio SendIt no está disponible temporalmente. Reintente en unos segundos.',
  'errors.unauthorized_api_key':
    "Ejecute 'openclaw sendit auth login --mode api-key' para re-autenticarse.",
  'errors.unauthorized_oauth':
    "Ejecute 'openclaw sendit auth login --mode oauth' para re-autenticarse.",
  'errors.forbidden': 'Verifique que su plan de API soporta esta función.',
  'errors.not_found':
    'Verifique que el ID del recurso existe usando la herramienta de listado correspondiente.',
  'errors.file_not_found': 'Archivo no encontrado en la ruta: {path}',
  'errors.permission_denied': 'Permiso denegado: {path}',
  'errors.restricted_path': 'La ruta está en un directorio restringido: {path}',
  'errors.invalid_action': 'Acción no soportada para {tool}: {action}',
  'errors.invalid_input': '{message}',
  'errors.mcp_disabled':
    'El puente MCP está desactivado en la configuración del plugin (mcp.enabled=false).',
  'errors.mcp_tool_unavailable':
    "La herramienta MCP '{tool}' no está disponible. Use sendit_capabilities para verificar las herramientas activas.",

  // ── Plugin meta ─────────────────────────────────────────────────────
  'plugin.registered': '[sendit] plugin registrado',
  'plugin.disabled': '[sendit] plugin desactivado en la configuración (enabled=false)',
  'plugin.mcp_probe_complete': '[sendit] Sonda MCP completada ({count} herramientas descubiertas)',
  'plugin.capabilities_failed': '[sendit] Fallo en la sonda de capacidades: {message}',
};
