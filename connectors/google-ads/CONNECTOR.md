# Google Ads Connector

## Overview
Read-only Google Ads API connector — query campaigns, ad groups, ads, keywords, budgets, bidding strategies, change history, audience segments, and geo targets. Supports arbitrary GAQL queries for custom analysis. No write operations are exposed.

## Authentication
- **Type:** OAuth2 Authorization Code (offline access for long-lived sessions)
- **Scopes:** `https://www.googleapis.com/auth/adwords` (Google Ads has no read-only scope variant; read-only is enforced by exposing query tools only)
- **Token URL:** `https://oauth2.googleapis.com/token`
- **Authorize URL:** `https://accounts.google.com/o/oauth2/v2/auth`
- **Authorize params:** `access_type=offline`, `prompt=consent` (so Google issues a refresh token; the connector then refreshes silently and the user does not need to re-authenticate every hour)
- **Additional:** Requires a Google Ads API developer token

## API Access Level

This connector works with **Basic access** (the default for approved developer tokens).

- **Daily limit:** 15,000 operations/day across all users sharing the developer token
- **Quota exhaustion:** Returns a clear `QUOTA_EXHAUSTED` error — no further calls should be made until the next day (resets at midnight Pacific Time)
- **Standard access:** Removes the 15,000/day limit. Apply via [Google Ads API Center](https://ads.google.com/aw/apicenter) when needed

### Quota Tips
- Use the dedicated read tools (`get_campaigns`, `get_ad_groups`, etc.) rather than `run_gaql_query` when possible
- Set `limit` parameters to the minimum needed

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

## Environment Variables
| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_DEVELOPER_TOKEN` | Google Ads API developer token |
| `GOOGLE_ADS_API_VERSION` | API version override (default: `v23`) |

## API Reference
- [Google Ads API](https://developers.google.com/google-ads/api/docs/start)
- [GAQL Reference](https://developers.google.com/google-ads/api/docs/query/overview)
