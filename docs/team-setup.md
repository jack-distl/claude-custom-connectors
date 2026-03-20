# Team Setup Guide

How to connect deployed connectors to Claude and share them with your team.

## Adding a Connector to Claude

### For You (Admin)

1. Open **Claude Desktop** (or claude.ai)
2. Go to **Settings** → **Integrations** (or **Connected Apps**)
3. Click **"Add Custom Integration"** or **"Add MCP Server"**
4. Enter:
   - **Name:** e.g., "Meta Ads" or "Google Ads"
   - **URL:** Your Railway deployment URL + `/mcp` (e.g., `https://meta-ads-production-xxxx.up.railway.app/mcp`)
5. Configure authentication if prompted (OAuth2 with the same credentials from Railway)
6. Save and test — you should see the connector's tools listed

### For Team Members (Max Plan)

On a Max plan with shared workspace:

1. The admin adds the connector once in **Organization Settings** → **Integrations**
2. Team members can see and use the connector automatically
3. Each team member authenticates individually (their own Meta/Google account)

If connectors aren't shared org-wide:
1. Each team member follows the same steps above with the deployment URL
2. Share the URL and setup instructions via your team channel

## Using Skills

After connecting a connector, add the matching skill to improve Claude's understanding:

1. Open a **Project** in Claude
2. Go to **Project Settings** → **Custom Instructions**
3. Copy the contents of the relevant skill file from `skills/` in this repo
4. Paste into the custom instructions
5. Now Claude knows the connector's tools and how to combine them for common tasks

## Testing a Connector

After setup, try these prompts to verify everything works:

**Meta Ads:**
> "List my Meta ad accounts"
> "Show me campaign performance for the last 7 days"

**Google Ads:**
> "List my Google Ads customer accounts"
> "Pull a campaign performance report for the last 30 days"

If Claude says it can't find the tools, check:
- The connector URL is correct (ends with `/mcp`)
- The connector is running (visit `/health` in your browser)
- Authentication is configured correctly

## Security Notes

- Access tokens are managed by Claude's integration layer — they're never stored in the connector
- Each team member authenticates with their own third-party account
- The connector servers are stateless — they don't store any data
- Railway deployments can be configured with private networking if needed
