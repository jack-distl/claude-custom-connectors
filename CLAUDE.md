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

## How to Create a New Connector

When asked to create a new connector (e.g., "Create a Slack connector"):

### 1. Copy the template
Copy `connectors/_template/` to `connectors/<connector-name>/`.

### 2. Update package.json
Change the name field to `@custom-connectors/<connector-name>`.

### 3. Build the API client (`src/api.ts`)
- Import `apiRequest` from `@custom-connectors/shared`
- Define typed interfaces for API responses
- Create functions for each API endpoint the connector needs
- Use the `authHeaders` pattern for authentication
- Always pass the access token as a parameter (don't read from env)

### 4. Define tools (`src/tools.ts`)
- Import `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`
- Import `z` from `zod` for parameter schemas
- Each tool needs: name, description, Zod parameter schema, handler function
- **Tool descriptions are critical** — Claude uses them to decide when to call each tool
- Use the `toolResult()` and `errorResult()` helpers pattern from existing connectors
- Always include `access_token` as a string parameter
- Handle errors with ConnectorError from shared

### 5. Wire up the server (`src/index.ts`)
```typescript
import { createConnectorServer, startServer } from "@custom-connectors/shared";
import { registerTools } from "./tools.js";

const config = { name: "Connector Name", version: "1.0.0" };
const server = createConnectorServer(config);
registerTools(server);
startServer(server, config);
```

### 6. Update deployment files
- Update `Dockerfile` — change all references from `_template` to the new connector name
- Update `railway.toml` — update the dockerfilePath
- Create `.env.example` with required environment variables
- Write `CONNECTOR.md` documenting tools, auth, and env vars

### 7. Test the build
Run `npm install` then `npm run build` from the repo root.

## Shared Utilities (`@custom-connectors/shared`)

### `createConnectorServer(config)` — Creates an MCP server instance
### `startServer(server, config)` — Starts HTTP server with MCP transport + health check
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

- **Access tokens are passed per-request** — connectors are stateless. Claude's integration handles OAuth and passes the token.
- **Each connector deploys independently** — own Dockerfile, own Railway service, own env vars.
- **Tools return JSON as text content** — use `JSON.stringify(data, null, 2)` for readability.
- **Errors return `isError: true`** — use the `ConnectorError.toToolResult()` pattern.

## Commands

```bash
npm install                              # Install all workspace dependencies
npm run build                            # Build all packages
npm run build --workspace=packages/shared    # Build just shared
npm run build --workspace=connectors/meta-ads  # Build just meta-ads
npm run dev --workspace=connectors/meta-ads    # Dev mode with watch
```
