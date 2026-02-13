import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadOpenClawConfig, writeOpenClawConfig } from "../src/config-io.js";

const ORIGINAL_ENV = { ...process.env };
let tempDir: string | null = null;

afterEach(async () => {
  process.env = { ...ORIGINAL_ENV };
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

test("loads config using OPENCLAW_CONFIG_PATH and writes normalized JSON", async () => {
  tempDir = await mkdtemp(join(tmpdir(), "sendit-openclaw-"));
  const configPath = join(tempDir, "custom-openclaw.json5");
  process.env.OPENCLAW_CONFIG_PATH = configPath;

  await writeFile(
    configPath,
    "{ plugins: { entries: { sendit: { enabled: true, config: { auth: { mode: 'api_key' } } } } } }",
    "utf8"
  );

  const loaded = await loadOpenClawConfig();
  assert.equal(loaded.configPath, configPath);
  assert.equal((loaded.config.plugins?.entries?.sendit as { enabled?: boolean })?.enabled, true);

  const next = {
    ...loaded.config,
    plugins: {
      ...loaded.config.plugins,
      entries: {
        ...(loaded.config.plugins?.entries || {}),
        sendit: {
          ...(loaded.config.plugins?.entries?.sendit || {}),
          enabled: true,
          config: {
            auth: {
              mode: "api_key",
              apiKey: "sk_live_unit_test",
            },
          },
        },
      },
    },
  };

  await writeOpenClawConfig(loaded.configPath, next);
  const raw = await readFile(loaded.configPath, "utf8");

  assert.match(raw, /"plugins"/);
  assert.match(raw, /"apiKey": "sk_live_unit_test"/);
});
