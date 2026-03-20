# Deploying a Connector to Railway

This guide walks through deploying a connector using the Railway web dashboard. No terminal needed.

## Prerequisites

- A Railway account (railway.com)
- This GitHub repo connected to Railway
- API credentials for the connector's third-party service

## Step-by-Step

### 1. Create a New Service in Railway

1. Open **railway.com** and go to your project (or create a new one)
2. Click **"New Service"** → **"GitHub Repo"**
3. Select this repository (`claude-custom-connectors`)
4. Railway will detect the repo — you'll configure the build next

### 2. Configure the Build

1. In the service settings, go to **"Build"**
2. Set **Dockerfile Path** to the connector's Dockerfile:
   - Meta Ads: `connectors/meta-ads/Dockerfile`
   - Google Ads: `connectors/google-ads/Dockerfile`
3. Set **Watch Paths** to only redeploy when the connector changes:
   - `packages/shared/**`
   - `connectors/<name>/**`

### 3. Set Environment Variables

1. Go to the service's **"Variables"** tab
2. Add the required variables from the connector's `.env.example` file
3. Railway automatically sets `PORT` — you don't need to add it

**Meta Ads variables:**
| Variable | Where to get it |
|----------|----------------|
| `META_APP_ID` | developers.facebook.com → Your App → Settings |
| `META_APP_SECRET` | Same page, click "Show" next to App Secret |

**Google Ads variables:**
| Variable | Where to get it |
|----------|----------------|
| `GOOGLE_CLIENT_ID` | console.cloud.google.com → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | Same page |
| `GOOGLE_DEVELOPER_TOKEN` | ads.google.com → Tools → API Center |

### 4. Deploy

1. Click **"Deploy"** or push to the main branch — Railway auto-deploys
2. Wait for the build to complete (usually 1-2 minutes)
3. Check the deploy logs for `"connector listening on port..."`

### 5. Get the Public URL

1. Go to the service's **"Settings"** tab
2. Under **"Networking"**, click **"Generate Domain"**
3. Copy the URL (e.g., `https://meta-ads-production-xxxx.up.railway.app`)
4. Verify it works by visiting `https://<your-url>/health` in your browser — you should see `{"status":"ok"}`

### 6. Deploy Additional Connectors

Repeat steps 1-5 for each connector. Each connector is a separate Railway service, so they each get their own URL, env vars, and logs.

## Troubleshooting

### Build fails
- Click on the failed deploy to see logs
- Common issue: missing environment variable — check the "Variables" tab

### Health check fails
- Verify the healthcheckPath is `/health` in service settings
- Check deploy logs for startup errors

### Connector not responding
- Check Railway logs (click the service → "Logs" tab)
- Verify the public domain is generated and active
- Try hitting `/health` endpoint directly

## Auto-Deploy on Push

Railway automatically redeploys when you push to the connected branch. So when Claude Code pushes changes, your connectors update automatically.
