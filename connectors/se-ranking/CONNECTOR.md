# SE Ranking Connector

MCP connector that exposes the [SE Ranking](https://seranking.com) API to Claude for SEO research, rank tracking, site audits, and competitor analysis.

## Auth model

SE Ranking uses **static API keys**, not OAuth. Because the connector is deployed once per agency and everyone shares the SE Ranking account, the keys are configured as environment variables on the Railway service — not per-user.

Two keys are required:

| Env var | SE Ranking key type | Covers |
| --- | --- | --- |
| `SE_RANKING_PROJECT_API_KEY` | Project / System key | Projects, keywords, rank tracking, audits, competitors, account, search volume |
| `SE_RANKING_DATA_API_KEY` | Data API key | Keyword research, domain analysis, backlink research |

Get both keys from **SE Ranking → Profile → API**.

## Environment variables

```
SE_RANKING_PROJECT_API_KEY=<project/system key>
SE_RANKING_DATA_API_KEY=<data api key>
PORT=3000
```

No `SERVER_URL`, `CLIENT_ID`, or `CLIENT_SECRET` — SE Ranking has no OAuth flow.

## Tools

### Account & billing (Project API)
- `se_get_account_balance` — Credit balance
- `se_get_account_profile` — Account profile
- `se_get_account_subscription` — Subscription plan
- `se_get_data_api_subscription` — Data API plan/credits (separate pool)

### Reference data
- `se_list_search_engines` — All supported engines with IDs
- `se_list_search_engine_languages` — Languages for a given engine
- `se_list_regions` — Geographic regions
- `se_get_search_volume` — Search volume lookup for a keyword list

### Projects
- `se_list_projects`
- `se_create_project`
- `se_update_project`
- `se_delete_project`
- `se_get_project_summary`
- `se_list_project_search_engines`
- `se_add_project_search_engine`
- `se_delete_project_search_engine`

### Project keywords
- `se_list_project_keywords`
- `se_add_project_keywords`
- `se_delete_project_keywords`
- `se_get_keyword_statistics` — Historical rankings
- `se_run_position_check` — Trigger on-demand check

### Competitors (in a project)
- `se_list_competitors`
- `se_add_competitor`
- `se_delete_competitor`
- `se_get_competitor_keywords`
- `se_get_project_top10`
- `se_get_project_top100`

### Website audit
- `se_create_audit`
- `se_list_audits`
- `se_get_audit_status`
- `se_get_audit_report`
- `se_get_audit_pages`
- `se_get_audit_issues`
- `se_recheck_audit`
- `se_delete_audit`

### Project backlinks
- `se_list_project_backlinks`
- `se_get_project_backlink_statistics`

### Keyword research (Data API)
- `se_keywords_similar` — Semantically similar keywords
- `se_keywords_related` — Related queries for clustering
- `se_keywords_questions` — Question-form keywords
- `se_keywords_longtail` — Long-tail variants
- `se_keywords_export` — Bulk metrics for a keyword list

### Domain analysis (Data API)
- `se_domain_overview` — Regional SEO overview
- `se_domain_overview_worldwide` — Global overview
- `se_domain_keywords` — Keywords a domain ranks for
- `se_domain_competitors` — Organic/paid competitors
- `se_domain_keyword_gaps` — Keywords competitors rank for but you don't

### Backlink research (Data API)
- `se_backlinks_summary` — Full backlink profile summary
- `se_backlinks_metrics` — Lighter metric lookup
- `se_backlinks_referring_domains` — Referring domains list

## API endpoints used

- **Project API** base: `https://api4.seranking.com`
- **Data API** base: `https://api.seranking.com/v1`

Both use `Authorization: Token <API_KEY>` for auth.

Rate limits (per SE Ranking docs):
- Project API: ~5 requests/sec
- Data API: 1–10 requests/sec depending on tier

The shared `apiRequest` helper retries transient failures and handles 429 with exponential backoff.

## Deploying to Railway

1. Create a new Railway service pointing at this repo, set the Dockerfile path to `connectors/se-ranking/Dockerfile`.
2. Set env vars in Railway:
   - `SE_RANKING_PROJECT_API_KEY`
   - `SE_RANKING_DATA_API_KEY`
   - `PORT=3000`
3. Deploy, then Settings → Networking → Generate Domain.
4. Add to Claude: Settings → Integrations → add the URL with `/mcp` appended (e.g. `https://se-ranking.up.railway.app/mcp`).

No `SERVER_URL` is needed because there's no OAuth callback.

## Local development

```bash
npm install
npm run build --workspace=connectors/se-ranking
SE_RANKING_PROJECT_API_KEY=xxx \
SE_RANKING_DATA_API_KEY=xxx \
  node connectors/se-ranking/dist/index.js
```

Health check: `curl http://localhost:3000/health`
