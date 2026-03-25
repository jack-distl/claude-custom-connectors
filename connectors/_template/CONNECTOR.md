# [Connector Name]

## Overview
Brief description of what this connector does and which API it connects to.

## Authentication
- **Type:** OAuth2 Authorization Code
- **Scopes:** list required scopes
- **Authorize URL:** the authorization endpoint
- **Token URL:** the token endpoint

> **Note:** OAuth is handled by the MCP transport layer. Access tokens are NOT passed as tool parameters — they flow automatically via the MCP session. The connector reads the token from `extra.authInfo.token` in each tool handler.

## Tools

### `tool_name`
Description of what this tool does.

**Parameters:**
- `param_name` (string, required) — description

**Returns:** Description of the response format.

## Environment Variables
| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `SERVER_URL` | Public URL of this Railway service (required for OAuth callbacks) | Railway → Settings → Networking → Generate Domain |
| `CLIENT_ID` | OAuth client ID | Third-party provider's developer portal |
| `CLIENT_SECRET` | OAuth client secret | Same as above |

## Setup Checklist

1. Create an OAuth app on the third-party provider's developer portal
2. Note the client ID, client secret, authorize URL, token URL, and required scopes
3. Deploy this connector to Railway (see `docs/railway-deploy.md`)
4. Set all environment variables in Railway
5. Generate a public domain in Railway and set `SERVER_URL` to it
6. Add the connector URL to Claude's integrations settings
7. Test by asking Claude to use one of the tools above

## API Reference
Link to the third-party API documentation.
