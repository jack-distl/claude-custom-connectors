import crypto from "node:crypto";
import type { Response } from "express";
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
 * OAuth provider that proxies authorization to an upstream provider (e.g., Meta, Google).
 * Handles dynamic client registration in-memory and forwards auth/token requests upstream.
 */
export class ConnectorOAuthProvider implements OAuthServerProvider {
  private clients = new Map<string, OAuthClientInformationFull>();
  skipLocalPkceValidation = true;

  constructor(private config: OAuthProxyConfig) {}

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
    url.searchParams.set("redirect_uri", params.redirectUri);
    const scopes = (params.scopes ?? this.config.scopes).join(" ");
    url.searchParams.set("scope", scopes);
    if (params.state) url.searchParams.set("state", params.state);
    console.log(`[OAuth] Authorize redirect_uri=${params.redirectUri} scopes=${scopes}`);
    res.redirect(url.toString());
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
    if (redirectUri) params.set("redirect_uri", redirectUri);

    console.log(`[OAuth] Token exchange: tokenUrl=${this.config.tokenUrl} redirect_uri=${redirectUri ?? "(none)"}`);

    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[OAuth] Token exchange failed (${response.status}): ${body}`);
      throw new Error(`Token exchange failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return {
      access_token: data.access_token as string,
      token_type: "bearer",
      ...(data.expires_in != null && {
        expires_in: Number(data.expires_in),
      }),
      ...(typeof data.refresh_token === "string" && {
        refresh_token: data.refresh_token,
      }),
    };
  }

  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[]
  ): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });
    if (scopes?.length) params.set("scope", scopes.join(" "));

    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[OAuth] Token refresh failed (${response.status}): ${body}`);
      throw new Error(`Token refresh failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return {
      access_token: data.access_token as string,
      token_type: "bearer",
      ...(data.expires_in != null && {
        expires_in: Number(data.expires_in),
      }),
      ...(typeof data.refresh_token === "string" && {
        refresh_token: data.refresh_token,
      }),
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
