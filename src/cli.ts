import type { Command } from "commander";
import type { OpenClawConfig } from "./openclaw-types.js";
import { resolveSendItPluginConfig, type SendItPluginConfig } from "./config.js";
import { loadOpenClawConfig, writeOpenClawConfig } from "./config-io.js";
import { SendItHttpClient } from "./http-client.js";

type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

function readEntryConfig(config: OpenClawConfig): Record<string, unknown> {
  const entry = config.plugins?.entries?.sendit;
  if (!entry || typeof entry !== "object") return {};
  const cfg = entry.config;
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return {};
  return cfg as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function patchEntryConfig(
  config: OpenClawConfig,
  configPatch: Record<string, unknown>
): OpenClawConfig {
  const existingEntry = config.plugins?.entries?.sendit || {};
  const existingConfig = readEntryConfig(config);

  return {
    ...config,
    plugins: {
      ...config.plugins,
      entries: {
        ...(config.plugins?.entries || {}),
        sendit: {
          ...existingEntry,
          enabled: true,
          config: {
            ...existingConfig,
            ...configPatch,
          },
        },
      },
    },
  };
}

function printStatus(config: SendItPluginConfig): string {
  const lines: string[] = [];
  lines.push(`enabled: ${config.enabled}`);
  lines.push(`baseUrl: ${config.baseUrl}`);
  lines.push(`auth.mode: ${config.auth.mode}`);
  lines.push(`auth.apiKey: ${config.auth.apiKey ? "configured" : "missing"}`);
  lines.push(
    `auth.oauth: ${config.auth.oauth?.accessToken ? "configured" : "missing"}`
  );
  lines.push(`teamId: ${config.teamId || "(none)"}`);
  lines.push(`mcp.enabled: ${config.mcp.enabled}`);
  lines.push(`mcp.endpoint: ${config.mcp.endpoint}`);
  return lines.join("\n");
}

export function registerSendItCli(params: {
  program: Command;
  logger: Logger;
}): void {
  const { program, logger } = params;

  const root = program
    .command("sendit")
    .description("SendIt plugin management")
    .addHelpText(
      "after",
      "\nExamples:\n  openclaw sendit auth login --mode api-key --api-key sk_live_xxx\n  openclaw sendit auth login --mode oauth\n  openclaw sendit auth status\n  openclaw sendit doctor\n"
    );

  const auth = root.command("auth").description("Manage SendIt authentication");

  auth
    .command("login")
    .description("Configure SendIt auth mode")
    .option("--mode <mode>", "api-key or oauth", "api-key")
    .option("--api-key <key>", "SendIt API key (required for api-key mode)")
    .option("--skip-validate", "Skip API key validation ping", false)
    .action(
      async (options: { mode: string; apiKey?: string; skipValidate?: boolean }) => {
        const mode = String(options.mode || "api-key").trim().toLowerCase();
        const { configPath, config: current } = await loadOpenClawConfig();

        if (mode === "api-key") {
          const apiKey = String(options.apiKey || "").trim();
          if (!apiKey) {
            throw new Error("--api-key is required when --mode api-key");
          }

          if (!options.skipValidate) {
            const existingAuth = asRecord(readEntryConfig(current).auth);
            const validationConfig = resolveSendItPluginConfig(
              {
                ...readEntryConfig(current),
                auth: {
                  ...existingAuth,
                  mode: "api_key",
                  apiKey,
                },
              },
              current
            );

            const validationClient = new SendItHttpClient(validationConfig, logger);
            const ping = await validationClient.get("/accounts");
            if (!ping.success) {
              throw new Error(
                `API key validation failed: ${ping.error?.message || "accounts endpoint rejected credentials"}`
              );
            }
          }

          const updated = patchEntryConfig(current, {
            auth: {
              mode: "api_key",
              apiKey,
            },
          });

          await writeOpenClawConfig(configPath, updated);
          logger.info("[sendit] API key saved to plugins.entries.sendit.config.auth.apiKey");
          return;
        }

        if (mode === "oauth") {
          const existingAuth = asRecord(readEntryConfig(current).auth);
          const updated = patchEntryConfig(current, {
            auth: {
              ...existingAuth,
              mode: "oauth",
            },
          });
          await writeOpenClawConfig(configPath, updated);

          logger.info("[sendit] OAuth mode selected.");
          logger.info(
            "[sendit] Next step: run `openclaw models auth login --provider sendit` to complete OAuth and store profile credentials."
          );
          return;
        }

        throw new Error(`Unsupported mode '${mode}'. Use 'api-key' or 'oauth'.`);
      }
    );

  auth
    .command("status")
    .description("Show current SendIt auth status")
    .action(async () => {
      const { config: current } = await loadOpenClawConfig();
      const pluginConfig = resolveSendItPluginConfig(readEntryConfig(current), current);
      logger.info(printStatus(pluginConfig));
    });

  auth
    .command("logout")
    .description("Clear SendIt auth credentials from plugin config")
    .action(async () => {
      const { configPath, config: current } = await loadOpenClawConfig();

      const updated = patchEntryConfig(current, {
        auth: {
          mode: "auto",
          apiKey: "",
          oauth: {
            accessToken: "",
            refreshToken: "",
          },
        },
      });

      await writeOpenClawConfig(configPath, updated);
      logger.info("[sendit] Cleared plugin auth credentials. Auth profiles remain unchanged.");
    });

  root
    .command("doctor")
    .description("Run SendIt connectivity checks")
    .action(async () => {
      const { config: current } = await loadOpenClawConfig();
      const pluginConfig = resolveSendItPluginConfig(readEntryConfig(current), current);
      const httpClient = new SendItHttpClient(pluginConfig, logger);

      logger.info("[sendit] Running connectivity checks...");

      const capabilities = await httpClient.get("/capabilities");
      if (!capabilities.success) {
        logger.error(
          `[sendit] Capabilities check failed: ${capabilities.error?.message || "unknown error"}`
        );
        process.exitCode = 1;
        return;
      }

      const accounts = await httpClient.get("/accounts");
      if (!accounts.success) {
        logger.warn(
          `[sendit] Accounts check failed: ${accounts.error?.message || "unknown error"}`
        );
      } else {
        logger.info("[sendit] Accounts endpoint reachable.");
      }

      logger.info("[sendit] Capabilities endpoint reachable.");
      logger.info("[sendit] Doctor completed.");
    });
}
