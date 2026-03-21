export interface OAuthProxyConfig {
  /** Public URL of this server (e.g., "https://xxx.up.railway.app") */
  serverUrl: string;
  /** Upstream OAuth authorization URL */
  authorizeUrl: string;
  /** Upstream OAuth token URL */
  tokenUrl: string;
  /** Upstream OAuth client ID (e.g., Meta App ID) */
  clientId: string;
  /** Upstream OAuth client secret */
  clientSecret: string;
  /** OAuth scopes to request */
  scopes: string[];
}

export interface ConnectorConfig {
  /** Display name of the connector (e.g., "Meta Ads") */
  name: string;
  /** Semver version string */
  version: string;
  /** Port to listen on (defaults to PORT env var or 3000) */
  port?: number;
  /** OAuth proxy configuration — if provided, the server will handle OAuth for Claude */
  oauth?: OAuthProxyConfig;
}

export interface OAuthConfig {
  /** OAuth2 authorization URL */
  authorizeUrl: string;
  /** OAuth2 token exchange URL */
  tokenUrl: string;
  /** OAuth2 client ID */
  clientId: string;
  /** OAuth2 client secret */
  clientSecret: string;
  /** OAuth2 scopes to request */
  scopes: string[];
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface ApiRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** Number of retries on failure (default: 2) */
  retries?: number;
  /** Timeout in ms (default: 30000) */
  timeout?: number;
}
