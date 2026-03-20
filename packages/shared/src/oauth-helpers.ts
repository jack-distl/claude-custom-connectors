import type { OAuthConfig, OAuthTokens } from "./types.js";
import { AuthError } from "./errors.js";

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCodeForTokens(
  config: OAuthConfig,
  code: string,
  redirectUri: string
): Promise<OAuthTokens> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new AuthError(`Token exchange failed: ${body}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return parseTokenResponse(data);
}

/**
 * Refresh an expired access token.
 */
export async function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string
): Promise<OAuthTokens> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new AuthError(`Token refresh failed: ${body}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return parseTokenResponse(data);
}

/**
 * Build an OAuth2 authorization URL.
 */
export function buildAuthorizationUrl(
  config: OAuthConfig,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: config.scopes.join(" "),
    state,
  });

  return `${config.authorizeUrl}?${params.toString()}`;
}

function parseTokenResponse(data: Record<string, unknown>): OAuthTokens {
  const accessToken = data.access_token;
  if (typeof accessToken !== "string") {
    throw new AuthError("No access_token in token response");
  }

  const tokens: OAuthTokens = { accessToken };

  if (typeof data.refresh_token === "string") {
    tokens.refreshToken = data.refresh_token;
  }

  if (typeof data.expires_in === "number") {
    tokens.expiresAt = Date.now() + data.expires_in * 1000;
  }

  return tokens;
}
