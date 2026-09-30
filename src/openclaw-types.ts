import type { Command } from 'commander';

export interface OpenClawPluginEntry {
  enabled?: boolean;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenClawConfig {
  models?: {
    providers?: Record<string, unknown>;
    [key: string]: unknown;
  };
  plugins?: {
    entries?: Record<string, OpenClawPluginEntry>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface PluginLogger {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface ProviderPrompter {
  password(input: { message: string }): Promise<string>;
  text(input: { message: string }): Promise<string>;
  note(message: string, title?: string): Promise<void>;
  progress(label: string): { stop: (status?: string) => void };
}

export interface ProviderAuthContext {
  config: OpenClawConfig;
  isRemote: boolean;
  prompter: ProviderPrompter;
  openUrl: (url: string) => Promise<void>;
}

export interface SendItOAuthCredential {
  access?: string;
  refresh?: string;
  expires?: number;
  clientId?: string;
  clientSecret?: string;
}

export interface OpenClawPluginCliContext {
  program: Command;
  logger: PluginLogger;
  config: OpenClawConfig;
}

export interface ProviderAuthMethod {
  id: string;
  label: string;
  hint?: string;
  kind: 'oauth' | 'api_key' | 'token' | 'device_code' | 'custom';
  run: (ctx: ProviderAuthContext) => Promise<{
    profiles: Array<{
      profileId: string;
      credential: Record<string, unknown>;
    }>;
    configPatch?: Partial<OpenClawConfig>;
    notes?: string[];
    defaultModel?: string;
  }>;
}

export interface OpenClawProviderPlugin {
  id: string;
  label: string;
  docsPath?: string;
  aliases?: string[];
  auth: ProviderAuthMethod[];
  refreshOAuth?: (credential: SendItOAuthCredential) => Promise<SendItOAuthCredential>;
  buildMissingAuthMessage?: () => string;
}

export interface OpenClawPluginApi {
  config: OpenClawConfig;
  pluginConfig?: Record<string, unknown>;
  logger: PluginLogger;
  registerTool: (tool: unknown, opts?: { names?: string[]; optional?: boolean }) => void;
  registerProvider: (provider: OpenClawProviderPlugin) => void;
  registerCli: (
    registrar: (ctx: OpenClawPluginCliContext) => void | Promise<void>,
    opts?: { commands?: string[] }
  ) => void;
}

export interface OpenClawPluginDefinition {
  id?: string;
  name?: string;
  description?: string;
  configSchema?: unknown;
  register?: (api: OpenClawPluginApi) => void;
}
