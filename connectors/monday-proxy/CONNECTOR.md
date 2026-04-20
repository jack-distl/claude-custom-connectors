# Monday.com MCP Proxy Server

A security-focused MCP proxy that connects Claude to the Monday.com GraphQL API while enforcing **public-board-only access** at the server level.

## Why a Proxy?

The native Monday.com MCP connector gives Claude access to all boards, including private ones. This proxy adds multiple security layers so it's impossible to access private boards from the prompt layer.

## Security Layers

1. **Query injection**: Any `boards()` GraphQL call without `board_kind` specified gets `board_kind: public` injected automatically
2. **Board ID validation**: Queries referencing specific board IDs are validated against a cached set of public board IDs
3. **Real-time fallback**: Cache misses trigger a direct API check (handles newly created boards)
4. **Item tracing**: Operations on items trace back to the parent board and validate it's public
5. **Cache refresh**: Public board ID cache refreshes every 5 minutes

## Tools

| Tool | Description |
|------|-------------|
| `list_public_boards` | List all public boards with pagination |
| `get_board` | Get detailed board info (columns, groups, views, owners) |
| `get_board_items` | Get items with column values, subitems, cursor pagination |
| `get_item_updates` | Get comments/updates on an item with creator info |
| `search_boards` | Search boards by name (returns only public results) |
| `create_update` | Add a comment/post to an item on a public board |
| `change_column_values` | Update column values on an item |
| `create_item` | Create a new item on a public board |
| `raw_graphql` | Execute raw GraphQL with automatic public board filtering |
| `cache_status` | Check the public board cache status |

## Authentication

This connector uses a **server-side API token** — no per-user OAuth. The Monday.com API token is set as an environment variable on the Railway service.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONDAY_API_TOKEN` | Yes | Monday.com API token (personal or integration) |
| `PORT` | No | Defaults to 3000, Railway sets automatically |

## Getting Your API Token

1. Go to **monday.com**
2. Click your **avatar** (bottom-left) → **Developers**
3. Click **My access tokens**
4. Copy your API token

## Deployment

1. Create a new Railway service pointing to this repo
2. Set the Dockerfile path to `connectors/monday-proxy/Dockerfile`
3. Set `MONDAY_API_TOKEN` in Railway environment variables
4. Deploy and generate a domain (Settings → Networking → Generate Domain)
5. Add the connector URL to Claude (Settings → Integrations)
