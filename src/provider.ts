import { loginSendItOAuth, refreshSendItOAuthToken } from "./oauth.js";
import { resolveSendItPluginConfig } from "./config.js";
import type {
  OpenClawConfig,
  OpenClawPluginApi,
  ProviderAuthContext,
  SendItOAuthCredential,
} from "./openclaw-types.js";

const PROVIDER_ID = "sendit";

type PluginEntryConfig = {
  enabled?: boolean;
  config?: Record<string, unknown>;
};

function mergePluginEntry(
  config: OpenClawConfig,
  pluginId: string,
  entryPatch: PluginEntryConfig
): OpenClawConfig {
  return {
    ...config,
    plugins: {
      ...config.plugins,
      entries: {
        ...(config.plugins?.entries || {}),
        [pluginId]: {
          ...(config.plugins?.entries?.[pluginId] || {}),
          ...entryPatch,
          config: {
            ...((config.plugins?.entries?.[pluginId]?.config as Record<string, unknown>) || {}),
            ...(entryPatch.config || {}),
          },
        },
      },
    },
  };
}

function buildProviderConfigPatch(params: {
  config: OpenClawConfig;
  mode: "api_key" | "oauth";
  apiKey?: string;
  oauth?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    clientId?: string;
    clientSecret?: string;
  };
}): Partial<OpenClawConfig> {
  const patchConfig: Record<string, unknown> = {
    auth: {
      mode: params.mode,
      ...(params.apiKey ? { apiKey: params.apiKey } : {}),
      ...(params.oauth
        ? {
            oauth: {
              accessToken: params.oauth.accessToken,
              refreshToken: params.oauth.refreshToken,
              expiresAt: params.oauth.expiresAt,
              clientId: params.oauth.clientId,
              clientSecret: params.oauth.clientSecret,
            },
          }
        : {}),
    },
  };

  return mergePluginEntry(params.config, PROVIDER_ID, {
    enabled: true,
    config: patchConfig,
  });
}

export function registerSendItProvider(api: OpenClawPluginApi): void {
  const pluginConfig = resolveSendItPluginConfig(api.pluginConfig, api.config);

  api.registerProvider({
    id: PROVIDER_ID,
    label: "SendIt",
    docsPath: "/providers/models",
    aliases: ["sendit-social"],
    auth: [
      {
        id: "api-key",
        label: "API Key",
        hint: "Use a SendIt API key from dashboard",
        kind: "api_key",
        run: async (ctx: ProviderAuthContext) => {
          const apiKey = String(
            await ctx.prompter.password({
              message: "Enter SendIt API key (sk_live_...):",
            })
          ).trim();

          if (!apiKey) {
            throw new Error("SendIt API key is required");
          }

          return {
            profiles: [
              {
                profileId: `${PROVIDER_ID}:api_key`,
                credential: {
                  type: "api_key",
                  provider: PROVIDER_ID,
                  key: apiKey,
                },
              },
            ],
            configPatch: buildProviderConfigPatch({
              config: ctx.config,
              mode: "api_key",
              apiKey,
            }),
            notes: [
              "API key auth is active for @sendit/openclaw.",
              "You can switch to OAuth with: openclaw models auth login --provider sendit",
            ],
          };
        },
      },
      {
        id: "oauth",
        label: "SendIt OAuth",
        hint: "Dynamic registration + PKCE",
        kind: "oauth",
        run: async (ctx: ProviderAuthContext) => {
          const progress = ctx.prompter.progress("Starting SendIt OAuth...");
          try {
            const result = await loginSendItOAuth(ctx, pluginConfig.baseUrl);
            progress.stop("SendIt OAuth complete");

            return {
              profiles: [
                {
                  profileId: `${PROVIDER_ID}:oauth`,
                  credential: {
                    type: "oauth",
                    provider: PROVIDER_ID,
                    access: result.accessToken,
                    refresh: result.refreshToken,
                    expires: result.expiresAt,
                    clientId: result.clientId,
                  },
                },
              ],
              configPatch: buildProviderConfigPatch({
                config: ctx.config,
                mode: "oauth",
                oauth: {
                  accessToken: result.accessToken,
                  refreshToken: result.refreshToken,
                  expiresAt: result.expiresAt,
                  clientId: result.clientId,
                  clientSecret: result.clientSecret,
                },
              }),
              notes: [
                "OAuth credentials were stored in plugin config and auth profiles.",
                "API key mode remains available as fallback.",
              ],
            };
          } catch (error) {
            progress.stop("SendIt OAuth failed");
            throw error;
          }
        },
      },
    ],
    refreshOAuth: async (credential: SendItOAuthCredential) => {
      const refreshed = await refreshSendItOAuthToken({
        baseUrl: pluginConfig.baseUrl,
        oauth: {
          accessToken: credential.access,
          refreshToken: credential.refresh,
          expiresAt: credential.expires,
          clientId: credential.clientId,
          clientSecret: pluginConfig.auth.oauth?.clientSecret,
        },
      });

      if (!refreshed?.accessToken) {
        throw new Error("Failed to refresh SendIt OAuth token");
      }

      return {
        ...credential,
        access: refreshed.accessToken,
        refresh: refreshed.refreshToken,
        expires: refreshed.expiresAt,
      };
    },
  });
}
