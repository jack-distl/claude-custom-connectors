# Google Ads Connector

## Overview
Connects to the Google Ads API to read customer accounts, campaigns, ad groups, keywords, performance reports, and search terms.

## Authentication
- **Type:** OAuth2 Authorization Code
- **Scopes:** `https://www.googleapis.com/auth/adwords`
- **Token URL:** `https://oauth2.googleapis.com/token`
- **Authorize URL:** `https://accounts.google.com/o/oauth2/v2/auth`
- **Additional:** Requires a Google Ads API developer token

## Tools

### `list_customers`
Lists all Google Ads customer accounts accessible by the authenticated user.

### `get_campaigns`
Lists campaigns for a customer account. Filterable by status (ENABLED, PAUSED, REMOVED).

### `get_ad_groups`
Lists ad groups within a specific campaign with basic metrics.

### `get_keywords`
Lists keywords within an ad group with match type and performance metrics.

### `get_performance_report`
Pulls a flexible performance report using GAQL. Supports campaign/ad_group/ad_group_ad level, custom date ranges, and configurable metrics.

### `get_search_terms`
Gets the search terms report — what people actually searched for that triggered your ads. Useful for keyword discovery and negative keyword identification.

## Environment Variables
| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_DEVELOPER_TOKEN` | Google Ads API developer token |

## API Reference
- [Google Ads API](https://developers.google.com/google-ads/api/docs/start)
- [GAQL Reference](https://developers.google.com/google-ads/api/docs/query/overview)
