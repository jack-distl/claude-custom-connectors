# Claude Custom Connectors

This is a monorepo for building MCP (Model Context Protocol) connectors that plug into Claude via custom integrations. Each connector is a standalone MCP server that connects Claude to a third-party API (Meta Ads, Google Ads, etc.).

## Repository Structure

```
packages/shared/          → Shared utilities (server factory, OAuth, API client, errors)
connectors/_template/     → Copy this to create a new connector
connectors/meta-ads/      → Meta/Facebook Marketing API connector
connectors/google-ads/    → Google Ads API connector
skills/                   → Skill templates for Claude Desktop
docs/                     → Deployment and setup guides
```

## Tech Stack

- **TypeScript** with Node.js 22
- **@modelcontextprotocol/sdk** v1.27+ for MCP server implementation
- **npm workspaces** for monorepo management
- **Railway** for deployment (each connector has its own Dockerfile)

## Workflow: What to Ask the User

**IMPORTANT:** When asked to create a new connector, do NOT dive straight into code. Follow this workflow:

### Before writing any code, ask the user:
1. **What third-party API** do you want to connect to? What specific actions (list, create, search, etc.)?
2. **Have you created an OAuth app** with the provider? (If not, tell them what to do — e.g., "Go to developers.facebook.com, create an app, and get the client ID and secret")
3. **What are the OAuth details?** Authorize URL, token URL, required scopes. (Research the API docs if the user doesn't know)
4. **Any special auth requirements?** Some APIs need extra credentials (e.g., Google Ads requires a developer token in addition to OAuth)

### After building the connector, tell the user what they need to do:
Don't assume they know the next steps. Give them a clear checklist:

1. **Create a Railway service** — Go to railway.com, create a new service pointing to this repo, set the Dockerfile path to `connectors/<name>/Dockerfile`
2. **Set environment variables** in Railway — List the exact variables and where to get each value:
   - `SERVER_URL` — leave blank for now, you'll set it after generating a domain
   - `CLIENT_ID` — from the OAuth app you created
   - `CLIENT_SECRET` — from the OAuth app you created
   - Any connector-specific vars (e.g., `GOOGLE_DEVELOPER_TOKEN`)
3. **Deploy and generate a domain** — Deploy the service, then go to Settings → Networking → Generate Domain
4. **Set SERVER_URL** — Copy the generated domain URL and add it as the `SERVER_URL` env var. This triggers a redeploy.
5. **Add to Claude** — Go to Claude settings → Integrations → Add the connector URL
6. **Test** — Ask Claude to use one of the connector's tools

## How to Create a New Connector

### 1. Copy the template
Copy `connectors/_template/` to `connectors/<connector-name>/`.

### 2. Update package.json
Change the name field to `@custom-connectors/<connector-name>`.

### 3. Build the API client (`src/api.ts`)
- Import `apiRequest` from `@custom-connectors/shared`
- Define typed interfaces for API responses
- Create functions for each API endpoint the connector needs
- Use the `authHeaders` pattern for authentication
- Each API function receives `accessToken` as a parameter (passed from the tool handler, NOT from env)

### 4. Define tools (`src/tools.ts`)
- Import `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`
- Import `z` from `zod` for parameter schemas
- Each tool needs: name, description, Zod parameter schema, handler function
- **Tool descriptions are critical** — Claude uses them to decide when to call each tool
- Use the `toolResult()` and `errorResult()` helpers (see template or meta-ads for examples)
- **Do NOT include `access_token` as a tool parameter** — the token comes from the MCP OAuth transport layer via `extra.authInfo.token`. Use the `getAccessToken(extra)` helper pattern:
  ```typescript
  function getAccessToken(extra: { authInfo?: { token?: string } }): string {
    const token = extra.authInfo?.token;
    if (!token) {
      throw new ConnectorError("No access token found. Please reconnect.", "AUTH_REQUIRED", 401);
    }
    return token;
  }
  ```
- Handler signature is `async (params, extra) =>` — the `extra` arg carries the auth token
- Handle errors with ConnectorError from shared

### 5. Wire up the server (`src/index.ts`)
```typescript
import { createConnectorServer, startServer } from "@custom-connectors/shared";
import { registerTools } from "./tools.js";

const config = {
  name: "Connector Name",
  version: "1.0.0",
  oauth: {
    serverUrl: process.env.SERVER_URL || "http://localhost:3000",
    authorizeUrl: "https://provider.com/oauth/authorize",
    tokenUrl: "https://provider.com/oauth/token",
    clientId: process.env.CLIENT_ID!,
    clientSecret: process.env.CLIENT_SECRET!,
    scopes: ["required_scope"],
  },
};

const server = createConnectorServer(config);
registerTools(server);
startServer(server, config, registerTools);
```

**The OAuth config is required.** Without it, the connector deploys but auth silently fails. The `registerTools` callback as the third arg to `startServer` is also required — it re-registers tools on new sessions.

### 6. Update deployment files
- Update `Dockerfile` — change all references from `_template` to the new connector name
- Update `railway.toml` — update the dockerfilePath
- Update `.env.example` with required environment variables (always include `SERVER_URL`, `CLIENT_ID`, `CLIENT_SECRET`)
- Write `CONNECTOR.md` documenting tools, auth, and env vars

### 7. Test the build
Run `npm install` then `npm run build` from the repo root.

### 8. Tell the user what to do next
After the code is built and pushed, give the user the deployment checklist from the "Workflow" section above. Don't assume they know the next steps.

## Shared Utilities (`@custom-connectors/shared`)

### `createConnectorServer(config)` — Creates an MCP server instance
### `startServer(server, config, registerTools)` — Starts HTTP server with MCP transport, OAuth, and health check
### `apiRequest<T>(url, options)` — Fetch wrapper with retry, timeout, rate-limit handling
### `exchangeCodeForTokens(config, code, redirectUri)` — OAuth2 code exchange
### `refreshAccessToken(config, refreshToken)` — OAuth2 token refresh
### `buildAuthorizationUrl(config, redirectUri, state)` — Build OAuth2 authorize URL
### Error classes: `ConnectorError`, `AuthError`, `RateLimitError`, `ApiError`

## How to Generate Skills for a Connector

When asked to generate a skill for a connector:

1. Read the connector's `CONNECTOR.md` and `src/tools.ts`
2. Create a skill file in `skills/<connector-name>.md`
3. The skill should:
   - Describe the connector's capabilities in natural language
   - List available tools with example use cases
   - Provide example prompts the team might use
   - Include a "How to Install" section with instructions for Claude Desktop

## Key Patterns

- **Access tokens flow via the MCP OAuth transport** — Claude's integration handles the OAuth flow and passes the token automatically. Tool handlers read it from `extra.authInfo.token` using the `getAccessToken(extra)` helper. Tokens are NOT tool parameters.
- **Each connector deploys independently** — own Dockerfile, own Railway service, own env vars.
- **Tools return JSON as text content** — use `JSON.stringify(data, null, 2)` for readability.
- **Errors return `isError: true`** — use the `ConnectorError.toToolResult()` pattern.
- **`SERVER_URL` must be set after deployment** — generate a Railway domain first, then set `SERVER_URL` to that domain. OAuth callbacks break without it.
- **Connectors are always deployed to Railway** — they're accessed via Claude Desktop/claude.ai, not run locally.

## Common Pitfalls

These issues have been hit and solved. Don't re-introduce them:

1. **`access_token` as a tool parameter** — Claude can't fill this in. The token comes from the MCP OAuth transport via `extra.authInfo.token`. Never add `access_token` to a tool's Zod schema.

2. **Missing OAuth config in `index.ts`** — Without the `oauth` block in the config, the connector deploys but `extra.authInfo` is always undefined. Every deployed connector needs the full OAuth config.

3. **Missing `registerTools` callback in `startServer`** — The third argument to `startServer(server, config, registerTools)` is required. It re-registers tools when new MCP sessions are created.

4. **Session-based transport is required** — Stateless transport causes reconnect loops. The shared `server-factory.ts` handles this correctly — don't override it.

5. **Rate limiting behind Railway's reverse proxy** — The MCP SDK's built-in rate limiter breaks behind reverse proxies. The shared server factory disables it and sets `trust proxy`. Don't re-enable SDK rate limiting.

6. **`SERVER_URL` not set** — OAuth callbacks redirect to `SERVER_URL`. If it's not set (or still `http://localhost:3000`), auth fails silently after deployment.

7. **API version/endpoint compatibility** — Some APIs have endpoints that only work via gRPC, not REST (e.g., Google Ads `searchStream`). Always verify that endpoints work over plain HTTP/REST before building tools around them. API versions deprecate — use the latest stable version.

## Commands

```bash
npm install                              # Install all workspace dependencies
npm run build                            # Build all packages
npm run build --workspace=packages/shared    # Build just shared
npm run build --workspace=connectors/meta-ads  # Build just meta-ads
npm run dev --workspace=connectors/meta-ads    # Dev mode with watch
```
