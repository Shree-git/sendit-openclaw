import { resolveSendItPluginConfig, type SendItPluginConfig } from './src/config.js';
import { SendItHttpClient } from './src/http-client.js';
import { SendItMcpClient } from './src/mcp-client.js';
import { refreshSendItOAuthToken } from './src/oauth.js';
import { registerSendItProvider } from './src/provider.js';
import { SendItToolRuntime } from './src/tools/index.js';
import { registerSendItCli } from './src/cli.js';
import type {
  OpenClawPluginApi,
  OpenClawPluginCliContext,
} from './src/openclaw-types.js';

const pluginConfigSchema = {
  parse(value: unknown): SendItPluginConfig {
    return resolveSendItPluginConfig(value);
  },
  uiHints: {
    'auth.apiKey': {
      label: 'SendIt API Key',
      sensitive: true,
    },
    'auth.oauth.accessToken': {
      label: 'OAuth Access Token',
      sensitive: true,
      advanced: true,
    },
    'auth.oauth.refreshToken': {
      label: 'OAuth Refresh Token',
      sensitive: true,
      advanced: true,
    },
    'auth.oauth.clientSecret': {
      label: 'OAuth Client Secret',
      sensitive: true,
      advanced: true,
    },
  },
};

const sendItPlugin = definePluginEntry({
  id: 'sendit',
  name: 'SendIt',
  description:
    'Official SendIt OpenClaw plugin for AI-native social publishing, scheduling, and growth workflows.',
  configSchema: pluginConfigSchema,
  register(hostApi): void {
    const api = hostApi as unknown as OpenClawPluginApi;
    const pluginConfig = resolveSendItPluginConfig(api.pluginConfig, api.config);

    registerSendItProvider(api);

    api.registerCli(
      ({ program, logger }: OpenClawPluginCliContext) => {
        registerSendItCli({
          program,
          logger,
        });
      },
      { commands: ['sendit'] }
    );

    if (!pluginConfig.enabled) {
      api.logger.info('[sendit] plugin is disabled in config (enabled=false)');
      return;
    }

    const hasAuth = Boolean(pluginConfig.auth.apiKey || pluginConfig.auth.oauth?.accessToken);

    const httpClient = new SendItHttpClient(pluginConfig, api.logger);
    httpClient.setOAuthRefresher(async (oauth) => {
      return refreshSendItOAuthToken({
        baseUrl: pluginConfig.baseUrl,
        oauth,
      });
    });

    const mcpClient =
      pluginConfig.mcp.enabled && hasAuth
        ? new SendItMcpClient(
            pluginConfig.mcp.endpoint,
            pluginConfig.timeouts.mcpMs,
            async () => {
              const mode = pluginConfig.auth.mode;
              if (mode === 'api_key') {
                return pluginConfig.auth.apiKey || null;
              }
              if (mode === 'oauth') {
                return pluginConfig.auth.oauth?.accessToken || null;
              }
              return pluginConfig.auth.apiKey || pluginConfig.auth.oauth?.accessToken || null;
            },
            pluginConfig.telemetry.enabled,
            pluginConfig.retries,
            api.logger
          )
        : null;

    const runtime = new SendItToolRuntime({
      httpClient,
      mcpClient,
      mcpEnabled: pluginConfig.mcp.enabled && hasAuth,
      authMode: pluginConfig.auth.mode,
      locale: pluginConfig.locale,
      logger: api.logger,
    });

    runtime.registerTools(api);
    api.logger.info('[sendit] plugin registered');
  },
});

export default sendItPlugin;
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
