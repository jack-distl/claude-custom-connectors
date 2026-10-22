import crypto from "node:crypto";
import type { Request, Response } from "express";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthProxyConfig } from "./types.js";

/**
 * Parse a token-endpoint response body. Prefers JSON, but falls back to
 * URL-encoded form data, which some providers (notably Facebook's
 * `oauth/access_token`) still return — `JSON.parse` throws on that and
 * would otherwise surface as an opaque 500.
 */
function parseTokenBody(body: string): Record<string, unknown> | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // Fall back to form-encoded (e.g. "access_token=...&expires=...").
    if (!trimmed.includes("=")) return null;
    const parsed = Object.fromEntries(new URLSearchParams(trimmed));
    // Facebook uses `expires` (seconds) here rather than `expires_in`.
    if (parsed.expires != null && parsed.expires_in == null) {
      parsed.expires_in = parsed.expires;
    }
    return Object.keys(parsed).length ? parsed : null;
  }
}

/** How long an in-flight authorization (user on the provider's consent screen) stays valid. */
const PENDING_AUTH_TTL_MS = 10 * 60 * 1000;

/** Issuer identifier for this server: its origin + path, without a trailing slash. */
export function issuerFor(serverUrl: string): string {
  return new URL(serverUrl).href.replace(/\/+$/, "");
}

interface PendingAuthorization {
  redirectUri: string;
  state?: string;
  expiresAt: number;
}

/**
 * OAuth provider that proxies authorization to an upstream provider (e.g., Meta, Google).
 * Handles dynamic client registration in-memory and forwards auth/token requests upstream.
 */
export class ConnectorOAuthProvider implements OAuthServerProvider {
  private clients = new Map<string, OAuthClientInformationFull>();
  private pendingAuthorizations = new Map<string, PendingAuthorization>();
  skipLocalPkceValidation = true;
  readonly issuer: string;
  readonly callbackUrl: string;

  constructor(private config: OAuthProxyConfig) {
    this.issuer = issuerFor(config.serverUrl);
    this.callbackUrl = `${this.issuer}/oauth/callback`;
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: async (clientId: string) => this.clients.get(clientId),
      registerClient: async (
        clientInput: Omit<
          OAuthClientInformationFull,
          "client_id" | "client_id_issued_at"
        >
      ) => {
        const clientId = crypto.randomUUID();
        const info = {
          ...clientInput,
          client_id: clientId,
          client_id_issued_at: Math.floor(Date.now() / 1000),
        } as OAuthClientInformationFull;
        this.clients.set(clientId, info);
        return info;
      },
    };
  }

  async authorize(
    _client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const url = new URL(this.config.authorizeUrl);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("response_type", "code");
    const scopes = (params.scopes ?? this.config.scopes).join(" ");
    url.searchParams.set("scope", scopes);
    if (this.config.proxyCallback) {
      // Send the provider back to us; handleCallback() forwards to Claude.
      const key = crypto.randomUUID();
      this.prunePendingAuthorizations();
      this.pendingAuthorizations.set(key, {
        redirectUri: params.redirectUri,
        state: params.state,
        expiresAt: Date.now() + PENDING_AUTH_TTL_MS,
      });
      url.searchParams.set("redirect_uri", this.callbackUrl);
      url.searchParams.set("state", key);
    } else {
      url.searchParams.set("redirect_uri", params.redirectUri);
      if (params.state) url.searchParams.set("state", params.state);
    }
    for (const [key, value] of Object.entries(this.config.authorizeParams ?? {})) {
      if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    }
    res.redirect(url.toString());
  }

  /**
   * `/oauth/callback` handler (only used with `proxyCallback`). Forwards the
   * provider's code (or error) to Claude's original redirect URI with
   * Claude's original state, and sets `iss` to this server's issuer
   * (RFC 9207) in place of whatever the provider sent.
   */
  handleCallback(req: Request, res: Response): void {
    const key = typeof req.query.state === "string" ? req.query.state : "";
    const pending = this.pendingAuthorizations.get(key);
    this.pendingAuthorizations.delete(key);
    if (!pending || pending.expiresAt < Date.now()) {
      console.error("[OAuth] Callback with unknown or expired state");
      res.status(400).send("This sign-in link has expired. Please try connecting again.");
      return;
    }

    const target = new URL(pending.redirectUri);
    for (const name of ["code", "error", "error_description", "error_uri"]) {
      const value = req.query[name];
      if (typeof value === "string") target.searchParams.set(name, value);
    }
    if (pending.state) target.searchParams.set("state", pending.state);
    target.searchParams.set("iss", this.issuer);
    res.redirect(target.toString());
  }

  private prunePendingAuthorizations(): void {
    const now = Date.now();
    for (const [key, pending] of this.pendingAuthorizations) {
      if (pending.expiresAt < now) this.pendingAuthorizations.delete(key);
    }
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    _authorizationCode: string
  ): Promise<string> {
    // Upstream handles validation; we skip local PKCE
    return "";
  }

  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string
  ): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code: authorizationCode,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });
    // The provider issued the code against whichever redirect URI it was
    // given in authorize(), so the exchange must repeat that one.
    if (this.config.proxyCallback) params.set("redirect_uri", this.callbackUrl);
    else if (redirectUri) params.set("redirect_uri", redirectUri);

    const data = await this.postToTokenEndpoint(params, "Token exchange");

    // Upgrade the short-lived token to a long-lived (~60 day) one so the
    // session survives far past the default ~1-2h, then hand the long-lived
    // token back as the refresh token to enable best-effort extension.
    if (this.config.longLivedTokenExchange) {
      const longLived = await this.exchangeForLongLivedToken(
        data.access_token as string
      );
      return this.toOAuthTokens(longLived, true);
    }

    return this.toOAuthTokens(data);
  }

  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[]
  ): Promise<OAuthTokens> {
    // Facebook user tokens have no real refresh token; the long-lived token
    // itself was handed back as the "refresh token". Re-run the long-lived
    // exchange against it to mint a fresh one and extend the session.
    if (this.config.longLivedTokenExchange) {
      const data = await this.exchangeForLongLivedToken(refreshToken);
      return this.toOAuthTokens(data, true);
    }

    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });
    if (scopes?.length) params.set("scope", scopes.join(" "));

    const data = await this.postToTokenEndpoint(params, "Token refresh");
    return this.toOAuthTokens(data);
  }

  /**
   * Exchange a Facebook short-lived (or existing long-lived) user token for a
   * long-lived (~60 day) one via `grant_type=fb_exchange_token`.
   */
  private async exchangeForLongLivedToken(
    token: string
  ): Promise<Record<string, unknown>> {
    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      fb_exchange_token: token,
    });
    return this.postToTokenEndpoint(params, "Long-lived token exchange");
  }

  /**
   * POST to the upstream token endpoint and return the parsed body.
   *
   * Robust against two real-world quirks:
   *  - the `fetch` itself rejecting (network/TLS) — caught and surfaced
   *    instead of bubbling up as an opaque 500
   *  - providers that return a URL-encoded body (e.g. Facebook's
   *    `oauth/access_token` returns `access_token=...&expires=...` rather
   *    than JSON) — `response.json()` would throw on that, so we read the
   *    raw text once and parse JSON with a form-encoded fallback.
   *
   * Always logs the upstream status + body so failures are diagnosable.
   */
  private async postToTokenEndpoint(
    params: URLSearchParams,
    label: string
  ): Promise<Record<string, unknown>> {
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(this.config.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: params.toString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[OAuth] ${label} request to ${this.config.tokenUrl} failed: ${message}`);
      throw new Error(`${label} request failed: ${message}`);
    }

    const rawBody = await response.text();

    if (!response.ok) {
      console.error(`[OAuth] ${label} failed (${response.status}): ${rawBody}`);
      throw new Error(`${label} failed (${response.status}): ${rawBody}`);
    }

    const data = parseTokenBody(rawBody);
    if (!data || typeof data.access_token !== "string") {
      console.error(
        `[OAuth] ${label} returned no access_token (${response.status}): ${rawBody}`
      );
      throw new Error(`${label} returned no access_token: ${rawBody}`);
    }
    return data;
  }

  private toOAuthTokens(
    data: Record<string, unknown>,
    selfRefresh = false
  ): OAuthTokens {
    const accessToken = data.access_token as string;
    const refreshToken =
      typeof data.refresh_token === "string"
        ? data.refresh_token
        : selfRefresh
          ? accessToken
          : undefined;
    return {
      access_token: accessToken,
      token_type: "bearer",
      ...(data.expires_in != null && {
        expires_in: Number(data.expires_in),
      }),
      ...(refreshToken != null && { refresh_token: refreshToken }),
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    // We trust the token from the upstream provider.
    // Actual validation happens when tools use it to call the API.
    // Set expiresAt to 1 hour from now — requireBearerAuth rejects tokens without it.
    return {
      token,
      clientId: "claude",
      scopes: this.config.scopes,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
  }
}
