import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdkEntry = fileURLToPath(import.meta.resolve('openclaw/plugin-sdk/plugin-entry'));
const hostEntry = resolve(dirname(sdkEntry), '..', '..', 'openclaw.mjs');
const sandbox = mkdtempSync(join(tmpdir(), 'sendit-openclaw-install-'));
const configPath = join(sandbox, 'openclaw.json');
writeFileSync(configPath, JSON.stringify({
  gateway: { mode: 'local' },
  agents: { defaults: { workspace: join(sandbox, 'workspace') } },
}));

const env = {
  ...process.env,
  OPENCLAW_STATE_DIR: sandbox,
  OPENCLAW_CONFIG_PATH: configPath,
  SENDIT_API_KEY: '',
  OPENCLAW_SENDIT_API_KEY: '',
  OPENCLAW_SENDIT_TOKEN: '',
  SENDIT_BASE_URL: '',
};

function host(...args) {
  return execFileSync(process.execPath, [hostEntry, ...args], {
    cwd: packageRoot,
    env,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

try {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const packed = JSON.parse(execFileSync(npm, [
    'pack', '--ignore-scripts', '--json', '--pack-destination', sandbox,
  ], { cwd: packageRoot, env, encoding: 'utf8' }))[0];
  assert.ok(packed.files.some(file => file.path === 'dist/index.js'));
  assert.ok(!packed.files.some(file => file.path.startsWith('dist/test/')));
  assert.ok(!packed.files.some(file => file.path === 'dist/src/tools.js'));
  host('plugins', 'install', `npm-pack:${join(sandbox, packed.filename)}`,
    '--force', '--accept-capabilities');
  const inspection = JSON.parse(host('plugins', 'inspect', 'sendit', '--runtime', '--json'));
  assert.equal(inspection.plugin.status, 'loaded', JSON.stringify(inspection.diagnostics));
  assert.equal(inspection.plugin.toolNames.length, 41);
  assert.equal(inspection.plugin.cliCommands.includes('sendit'), true);
  assert.deepEqual(inspection.diagnostics.filter(entry => entry.level === 'error'), []);
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'openclaw.plugin.json'), 'utf8'));
  assert.deepEqual([...inspection.plugin.toolNames].sort(), [...manifest.contracts.tools].sort());
  const cliHelp = host('sendit', '--help');
  assert.match(cliHelp, /auth/);
  assert.match(cliHelp, /doctor/);
  const authStatus = host('sendit', 'auth', 'status');
  assert.match(authStatus, /auth|apiKey/i);
  console.log(JSON.stringify({
    package: packed.id,
    host: '2026.9.6',
    node: process.version,
    status: inspection.plugin.status,
    tools: inspection.plugin.toolNames.length,
    cli: inspection.plugin.cliCommands,
    packageInstall: 'npm-pack',
    diagnostics: inspection.diagnostics,
  }, null, 2));
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
