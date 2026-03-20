# Creating a New Connector — End-to-End Guide

This is your playbook for going from "I want a connector for X" to a deployed, team-usable integration.

## The Process

### Step 1: Workshop with Claude Code

Open Claude Code in this repo and say something like:

> "Create a new Slack connector that can list channels, send messages, and search message history"

Claude Code will:
- Read `CLAUDE.md` to understand the patterns
- Copy the `_template` directory
- Build out the API client and tools
- Update deployment files
- Commit and push

**Tips for good prompts:**
- Name the specific API actions you want (list, create, search, etc.)
- Mention the API version if you have a preference
- Note any special auth requirements (e.g., "uses bot tokens, not user tokens")

### Step 2: Review the Code

Claude Code will show you what it created. Review:
- Are the tools named clearly?
- Are the descriptions helpful? (Claude uses these to decide when to call each tool)
- Is anything missing?

Ask Claude Code to iterate:
> "Add a tool for creating channels too"
> "The search tool should support date filtering"

### Step 3: Deploy to Railway

Follow the [Railway Deployment Guide](./railway-deploy.md):
1. Create a new Railway service pointing to the connector's Dockerfile
2. Set environment variables
3. Deploy and get the public URL

### Step 4: Connect to Claude

Follow the [Team Setup Guide](./team-setup.md):
1. Add the connector URL to Claude's integrations
2. Configure OAuth if needed
3. Test with a simple prompt

### Step 5: Generate a Skill

Back in Claude Code:
> "Generate a skill for the Slack connector"

Claude Code will read the connector's tools and create a skill file in `skills/`. Copy the skill content into your Claude project's custom instructions.

### Step 6: Share with Team

- Share the Railway URL with team members
- Share the skill file content
- Team members add the connector to their Claude settings

### Step 7: Iterate

When you or the team finds issues or wants new features:
1. Open Claude Code
2. Describe what you want changed
3. Claude Code updates the connector, commits, pushes
4. Railway auto-redeploys
5. No action needed from team members — the same URL serves the updated connector

## Checklist for Each New Connector

- [ ] `connectors/<name>/package.json` — name updated
- [ ] `connectors/<name>/src/api.ts` — API client with typed responses
- [ ] `connectors/<name>/src/tools.ts` — Tools registered with clear descriptions
- [ ] `connectors/<name>/src/index.ts` — Server wired up
- [ ] `connectors/<name>/Dockerfile` — Paths updated
- [ ] `connectors/<name>/railway.toml` — Dockerfile path updated
- [ ] `connectors/<name>/.env.example` — Required env vars documented
- [ ] `connectors/<name>/CONNECTOR.md` — Tools and auth documented
- [ ] `skills/<name>.md` — Skill file created
- [ ] Build passes: `npm run build`
- [ ] Railway service created and deployed
- [ ] Connector URL added to Claude settings
- [ ] Skill added to project custom instructions
