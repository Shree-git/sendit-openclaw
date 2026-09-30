import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { SendItOAuthConfig } from './config.js';
import { resolveOAuthEndpoints } from './config.js';
import type { ProviderAuthContext } from './openclaw-types.js';

interface DynamicClientRegistrationResponse {
  client_id: string;
  client_secret?: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

interface OAuthLoginResult {
  clientId: string;
  clientSecret?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('hex');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function buildState(): string {
  return randomBytes(16).toString('hex');
}

function parseCallbackUrl(urlText: string): { code?: string; state?: string; error?: string } {
  try {
    const parsed = new URL(urlText.trim());
    return {
      code: parsed.searchParams.get('code') || undefined,
      state: parsed.searchParams.get('state') || undefined,
      error: parsed.searchParams.get('error') || undefined,
    };
  } catch {
    return { error: 'invalid_callback_url' };
  }
}

async function startCallbackServer(port: number): Promise<{
  waitForCallback: (timeoutMs: number) => Promise<URL>;
  close: () => Promise<void>;
}> {
  let server: Server | null = null;

  const callbackPromise = new Promise<URL>((resolve, reject) => {
    server = createServer((req, res) => {
      if (!req.url) {
        res.statusCode = 400;
        res.end('Missing callback URL');
        return;
      }

      const callbackUrl = new URL(req.url, `http://127.0.0.1:${port}`);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<html><body><h1>SendIt auth complete</h1><p>Return to OpenClaw.</p></body></html>');
      resolve(callbackUrl);

      setImmediate(() => {
        server?.close();
      });
    });

    server.once('error', reject);
    server.listen(port, '127.0.0.1');
  });

  return {
    async waitForCallback(timeoutMs: number): Promise<URL> {
      return await Promise.race([
        callbackPromise,
        new Promise<URL>((_resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('OAuth callback timed out'));
          }, timeoutMs);
          timeout.unref?.();
        }),
      ]);
    },
    close: async () =>
      new Promise<void>((resolve) => {
        if (!server) {
          resolve();
          return;
        }
        server.close(() => resolve());
      }),
  };
}

async function registerOAuthClient(
  registerEndpoint: string,
  redirectUri: string
): Promise<DynamicClientRegistrationResponse> {
  const response = await fetch(registerEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_name: 'OpenClaw SendIt Plugin',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
    }),
  });

  const payload = (await response.json()) as DynamicClientRegistrationResponse & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.client_id) {
    throw new Error(
      payload.error_description || payload.error || 'Failed to register OAuth client'
    );
  }

  return payload;
}

async function exchangeCode(params: {
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  code: string;
  redirectUri: string;
  verifier: string;
}): Promise<TokenResponse> {
  const response = await fetch(params.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.verifier,
      client_id: params.clientId,
      client_secret: params.clientSecret,
    }),
  });

  const payload = (await response.json()) as TokenResponse & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'Token exchange failed');
  }

  return payload;
}

export async function loginSendItOAuth(
  ctx: ProviderAuthContext,
  baseUrl: string
): Promise<OAuthLoginResult> {
  const endpoints = resolveOAuthEndpoints({
    enabled: true,
    baseUrl,
    auth: { mode: 'oauth' },
    timeouts: { requestMs: 20_000, mcpMs: 25_000 },
    retries: { max: 2, backoffMs: 500 },
    mcp: { enabled: true, endpoint: `${baseUrl}/api/mcp` },
    telemetry: { enabled: true },
    locale: 'en',
  });

  const port = 6279;
  const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
  const { verifier, challenge } = generatePkce();
  const state = buildState();

  const callbackServer = ctx.isRemote ? null : await startCallbackServer(port);

  try {
    const registration = await registerOAuthClient(endpoints.register, redirectUri);

    const authUrl = new URL(endpoints.authorize);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', registration.client_id);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'mcp offline_access');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    await ctx.prompter.note(
      'Complete SendIt authorization in your browser. The callback is captured automatically.',
      'SendIt OAuth'
    );

    await ctx.openUrl(authUrl.toString());

    let callback: { code?: string; state?: string; error?: string };

    if (ctx.isRemote) {
      const pasted = String(
        await ctx.prompter.text({
          message: 'Paste the full callback URL after approving SendIt:',
        })
      );
      callback = parseCallbackUrl(pasted);
    } else {
      const url = await callbackServer!.waitForCallback(180_000);
      callback = {
        code: url.searchParams.get('code') || undefined,
        state: url.searchParams.get('state') || undefined,
        error: url.searchParams.get('error') || undefined,
      };
    }

    if (callback.error) {
      throw new Error(`OAuth authorize returned error: ${callback.error}`);
    }

    if (!callback.code) {
      throw new Error('OAuth callback did not include code');
    }

    if (callback.state !== state) {
      throw new Error('OAuth state mismatch');
    }

    const token = await exchangeCode({
      tokenEndpoint: endpoints.token,
      clientId: registration.client_id,
      clientSecret: registration.client_secret,
      code: callback.code,
      redirectUri,
      verifier,
    });
    const accessToken = token.access_token;
    if (!accessToken) {
      throw new Error('Token exchange returned no access token');
    }

    const expiresAt = token.expires_in ? Date.now() + token.expires_in * 1000 : undefined;

    return {
      clientId: registration.client_id,
      clientSecret: registration.client_secret,
      accessToken,
      refreshToken: token.refresh_token,
      expiresAt,
    };
  } finally {
    await callbackServer?.close();
  }
}

export async function refreshSendItOAuthToken(params: {
  baseUrl: string;
  oauth: SendItOAuthConfig;
}): Promise<SendItOAuthConfig | null> {
  if (!params.oauth.refreshToken) {
    return null;
  }

  const endpoints = resolveOAuthEndpoints({
    enabled: true,
    baseUrl: params.baseUrl,
    auth: { mode: 'oauth' },
    timeouts: { requestMs: 20_000, mcpMs: 25_000 },
    retries: { max: 2, backoffMs: 500 },
    mcp: { enabled: true, endpoint: `${params.baseUrl}/api/mcp` },
    telemetry: { enabled: true },
    locale: 'en',
  });

  const response = await fetch(endpoints.token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: params.oauth.refreshToken,
      client_id: params.oauth.clientId,
      client_secret: params.oauth.clientSecret,
    }),
  });

  const payload = (await response.json()) as TokenResponse & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    return null;
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || params.oauth.refreshToken,
    expiresAt: payload.expires_in ? Date.now() + payload.expires_in * 1000 : params.oauth.expiresAt,
    clientId: params.oauth.clientId,
    clientSecret: params.oauth.clientSecret,
  };
}
