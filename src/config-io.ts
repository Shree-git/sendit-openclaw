import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import JSON5 from "json5";
import type { OpenClawConfig } from "./openclaw-types.js";

const CONFIG_FILENAMES = [
  "openclaw.json",
  "clawdbot.json",
  "moltbot.json",
  "moldbot.json",
] as const;

const STATE_DIRNAMES = [
  ".openclaw",
  ".clawdbot",
  ".moltbot",
  ".moldbot",
] as const;

function normalize(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function resolveHomeDir(env: NodeJS.ProcessEnv): string {
  const explicit = normalize(env.OPENCLAW_HOME);
  const baseHome = normalize(env.HOME) || normalize(env.USERPROFILE) || homedir() || process.cwd();

  if (!explicit) {
    return resolve(baseHome);
  }

  if (explicit === "~" || explicit.startsWith("~/") || explicit.startsWith("~\\")) {
    return resolve(explicit.replace(/^~(?=$|[\\/])/, baseHome));
  }

  return resolve(explicit);
}

function resolveUserPath(input: string, env: NodeJS.ProcessEnv, home: string): string {
  const value = input.trim();
  if (!value) return resolve(home, "openclaw.json");
  if (value === "~" || value.startsWith("~/") || value.startsWith("~\\")) {
    return resolve(value.replace(/^~(?=$|[\\/])/, home));
  }
  if (isAbsolute(value)) {
    return resolve(value);
  }
  const cwd = normalize(env.PWD) || process.cwd();
  return resolve(cwd, value);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function dedupe(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    const key = resolve(p);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function buildConfigCandidates(env: NodeJS.ProcessEnv): string[] {
  const home = resolveHomeDir(env);
  const explicitConfig = normalize(env.OPENCLAW_CONFIG_PATH) || normalize(env.CLAWDBOT_CONFIG_PATH);
  if (explicitConfig) {
    return [resolveUserPath(explicitConfig, env, home)];
  }

  const candidates: string[] = [];
  const explicitState = normalize(env.OPENCLAW_STATE_DIR) || normalize(env.CLAWDBOT_STATE_DIR);
  if (explicitState) {
    const stateDir = resolveUserPath(explicitState, env, home);
    for (const name of CONFIG_FILENAMES) {
      candidates.push(join(stateDir, name));
    }
  }

  for (const dirnameValue of STATE_DIRNAMES) {
    const stateDir = join(home, dirnameValue);
    for (const name of CONFIG_FILENAMES) {
      candidates.push(join(stateDir, name));
    }
  }

  return dedupe(candidates);
}

export async function resolveOpenClawConfigPath(): Promise<string> {
  const candidates = buildConfigCandidates(process.env);
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return candidates[0] || resolve(process.cwd(), "openclaw.json");
}

export async function loadOpenClawConfig(): Promise<{
  configPath: string;
  config: OpenClawConfig;
}> {
  const configPath = await resolveOpenClawConfigPath();
  if (!(await fileExists(configPath))) {
    return { configPath, config: {} as OpenClawConfig };
  }

  const raw = await readFile(configPath, "utf8");
  if (!raw.trim()) {
    return { configPath, config: {} as OpenClawConfig };
  }

  try {
    const parsed = JSON5.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { configPath, config: {} as OpenClawConfig };
    }
    return { configPath, config: parsed as OpenClawConfig };
  } catch (error) {
    throw new Error(
      `Failed to parse OpenClaw config at ${configPath}: ${
        error instanceof Error ? error.message : "unknown parse error"
      }`
    );
  }
}

export async function writeOpenClawConfig(
  configPath: string,
  config: OpenClawConfig
): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
