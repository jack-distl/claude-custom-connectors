# Google Ads Connector

## Overview
Full-access Google Ads API connector — read, create, update, and remove campaigns, ad groups, ads, keywords, budgets, labels, and more. Supports GAQL queries for custom analysis.

## Authentication
- **Type:** OAuth2 Authorization Code
- **Scopes:** `https://www.googleapis.com/auth/adwords`
- **Token URL:** `https://oauth2.googleapis.com/token`
- **Authorize URL:** `https://accounts.google.com/o/oauth2/v2/auth`
- **Additional:** Requires a Google Ads API developer token

## Tools

### Read

| Tool | Description |
|------|-------------|
| `list_customers` | List all accessible Google Ads customer accounts |
| `get_campaigns` | List campaigns with metrics, filterable by status |
| `get_ad_groups` | List ad groups within a campaign |
| `get_ads` | List ads within an ad group with headlines, descriptions, URLs |
| `get_keywords` | List keywords with match types, bids, and metrics |
| `get_performance_report` | Flexible GAQL-based reporting (campaign/ad group/ad level) |
| `get_search_terms` | Search terms that triggered ads |
| `get_campaign_budgets` | List campaign budgets with amounts and delivery method |
| `get_bidding_strategies` | List portfolio bidding strategies |
| `get_change_history` | View recent account changes |
| `get_audience_segments` | List audience segments for targeting |
| `get_geo_targets` | Search geographic targeting locations by name |
| `run_gaql_query` | Execute arbitrary GAQL queries |

### Create

| Tool | Description |
|------|-------------|
| `create_campaign_budget` | Create a campaign budget (amount in micros) |
| `create_campaign` | Create a campaign with channel type and bidding strategy |
| `create_ad_group` | Create an ad group within a campaign |
| `create_responsive_search_ad` | Create an RSA (3-15 headlines, 2-4 descriptions) |
| `add_keywords` | Batch-add keywords to an ad group |
| `add_negative_keywords` | Add negative keywords at campaign or ad group level |
| `create_label` | Create a label for organizing entities |
| `apply_label` | Apply a label to a campaign, ad group, or ad |

### Update

| Tool | Description |
|------|-------------|
| `update_campaign_budget` | Update budget amount or name |
| `update_campaign` | Update campaign name, status, or bidding strategy |
| `update_ad_group` | Update ad group name, status, or CPC bid |
| `update_ad` | Pause or enable an ad |
| `update_keyword` | Update keyword status or CPC bid |

### Remove

| Tool | Description |
|------|-------------|
| `remove_campaign` | Remove a campaign (permanent) |
| `remove_ad_group` | Remove an ad group |
| `remove_ad` | Remove an ad |
| `remove_keyword` | Remove a keyword |

## Write Operations

All create/update/remove operations use the Google Ads API mutate pattern:
- **No auto-retry** — mutations use `retries: 0` to prevent duplicate creates
- **Resource names** — update and remove operations require full resource names (returned by read tools)
- **Micros** — all monetary amounts are in micros (multiply dollars by 1,000,000)
- **Campaigns default to PAUSED** — enable explicitly when ready to go live

## Environment Variables
| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_DEVELOPER_TOKEN` | Google Ads API developer token |
| `GOOGLE_ADS_API_VERSION` | API version override (default: `v19`) |

## API Reference
- [Google Ads API](https://developers.google.com/google-ads/api/docs/start)
- [GAQL Reference](https://developers.google.com/google-ads/api/docs/query/overview)
- [Mutate Operations](https://developers.google.com/google-ads/api/docs/mutating/overview)
