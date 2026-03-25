# Creating a New Connector — End-to-End Guide

This is your playbook for going from "I want a connector for X" to a deployed, team-usable integration. It clearly separates what **you** do from what **Claude Code** does.

## Before You Start

You need these things ready before Claude Code can build a useful connector:

### 1. Know what API you're connecting to
- What specific actions do you want? (list, create, search, update, etc.)
- What API version? (Check the provider's docs for the latest stable version)

### 2. Create an OAuth app with the provider
Most APIs require an OAuth app to get credentials. This is something **you** do on the provider's website:

| Provider | Where to create the OAuth app |
|----------|-------------------------------|
| Meta/Facebook | developers.facebook.com → Create App |
| Google | console.cloud.google.com → APIs & Services → Credentials → Create OAuth Client |
| Slack | api.slack.com/apps → Create New App |
| Other | Check the provider's developer documentation |

From the OAuth app, you'll need:
- **Client ID** and **Client Secret**
- **Authorize URL** — where users are redirected to grant access
- **Token URL** — where the connector exchanges codes for tokens
- **Scopes** — what permissions the connector needs

### 3. Check for extra requirements
Some APIs need more than just OAuth:
- **Google Ads** requires a Developer Token (apply at ads.google.com → Tools → API Center)
- Some APIs require app review or approval before you can access production data
- Some APIs have REST limitations (e.g., Google Ads `searchStream` only works via gRPC, not REST)

## The Process

### Step 1: Tell Claude Code what you want

Open Claude Code in this repo and describe what you need:

> "Create a Slack connector that can list channels, send messages, and search message history"

**Tips for good prompts:**
- Name the specific API actions you want
- Mention the API version if you have a preference
- Note any special auth requirements (e.g., "uses bot tokens, not user tokens")
- Share the OAuth details if you have them (client ID, scopes, URLs)

### Step 2: Claude Code builds the connector

Claude Code will:
- Read `CLAUDE.md` to understand the patterns
- Ask you about OAuth details if you haven't provided them
- Copy the `_template` directory
- Build out the API client and tools
- Wire up the server with OAuth config
- Update deployment files
- Commit and push

### Step 3: Review the code

Claude Code will show you what it created. Review:
- Are the tools named clearly?
- Are the descriptions helpful? (Claude uses these to decide when to call each tool)
- Is anything missing?

Ask Claude Code to iterate:
> "Add a tool for creating channels too"
> "The search tool should support date filtering"

### Step 4: You deploy to Railway

This is your step — Claude Code can't do this for you.

Follow the [Railway Deployment Guide](./railway-deploy.md):
1. Create a new Railway service pointing to the connector's Dockerfile
2. Set environment variables (Claude Code will tell you exactly which ones and where to get the values)
3. Deploy
4. Generate a public domain (Settings → Networking → Generate Domain)
5. **Set `SERVER_URL`** to the generated domain — this is critical for OAuth to work
6. Verify by visiting `https://<your-url>/health`

### Step 5: You connect it to Claude

1. Go to Claude settings → Integrations
2. Add the connector's Railway URL
3. Test with a simple prompt like "List my ad accounts" or "List my Slack channels"

### Step 6: Generate a skill (optional)

Back in Claude Code:
> "Generate a skill for the Slack connector"

Claude Code will read the connector's tools and create a skill file in `skills/`. Copy the skill content into your Claude project's custom instructions.

### Step 7: Share with team

- Share the Railway URL with team members
- Share the skill file content
- Team members add the connector to their Claude settings

### Step 8: Iterate

When you or the team finds issues or wants new features:
1. Open Claude Code
2. Describe what you want changed
3. Claude Code updates the connector, commits, pushes
4. Railway auto-redeploys
5. No action needed from team members — the same URL serves the updated connector

## Checklist for Each New Connector

**Before building:**
- [ ] OAuth app created with the third-party provider
- [ ] Client ID and Client Secret obtained
- [ ] Authorize URL, Token URL, and Scopes identified
- [ ] Any extra credentials obtained (e.g., developer tokens)

**After Claude Code builds it:**
- [ ] `connectors/<name>/package.json` — name updated
- [ ] `connectors/<name>/src/api.ts` — API client with typed responses
- [ ] `connectors/<name>/src/tools.ts` — Tools registered with clear descriptions
- [ ] `connectors/<name>/src/index.ts` — Server wired up with OAuth config
- [ ] `connectors/<name>/Dockerfile` — Paths updated
- [ ] `connectors/<name>/railway.toml` — Dockerfile path updated
- [ ] `connectors/<name>/.env.example` — Required env vars documented
- [ ] `connectors/<name>/CONNECTOR.md` — Tools and auth documented
- [ ] Build passes: `npm run build`

**After you deploy:**
- [ ] Railway service created
- [ ] Environment variables set (including `SERVER_URL`)
- [ ] Public domain generated
- [ ] `SERVER_URL` set to the public domain
- [ ] Health check passes: `https://<url>/health`
- [ ] Connector URL added to Claude settings
- [ ] Test prompt works
- [ ] `skills/<name>.md` — Skill file created (optional)
- [ ] Skill added to project custom instructions (optional)

## Common Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| Auth fails silently after deploy | `SERVER_URL` not set or still `localhost` | Set `SERVER_URL` to the Railway public domain |
| `extra.authInfo` is undefined | Missing OAuth config in `index.ts` | Ensure the `oauth` block is in the config object |
| Reconnect loops in Claude | Stateless transport mode | Already fixed in shared `server-factory.ts` — don't override |
| Rate limit errors behind Railway | MCP SDK rate limiter + reverse proxy | Already fixed in shared — SDK rate limiting is disabled |
| API returns 501 | Endpoint requires gRPC, not REST | Use a different endpoint (e.g., `search` instead of `searchStream`) |
| API returns 404 | Deprecated API version | Update to the latest stable API version |
