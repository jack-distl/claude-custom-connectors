# Skills

Skills are instructions you can add to Claude that teach it how to use your deployed connectors effectively.

## How to Install a Skill

1. Open **Claude Desktop**
2. Go to a **Project** where you want the skill available
3. Open **Project Settings** (gear icon)
4. Under **Custom Instructions** or **Skills**, paste the content of the skill file
5. Save — Claude now knows how to use that connector in this project

## Available Skills

- `meta-ads.md` — Work with Meta/Facebook advertising data
- `google-ads.md` — Work with Google Ads data

## Creating New Skills

When you build a new connector, ask Claude Code:
> "Generate a skill for the [connector name] connector"

It will read the connector's tools and create a matching skill file here.
