# Meta Ads Connector

## Overview
Connects to the Meta (Facebook) Marketing API to read ad account data, campaigns, ad sets, ads, performance insights, and audiences.

## Authentication
- **Type:** OAuth2 Authorization Code
- **Scopes:** `ads_read`, `ads_management`
- **Token URL:** `https://graph.facebook.com/v21.0/oauth/access_token`
- **Authorize URL:** `https://www.facebook.com/v21.0/dialog/oauth`

## Tools

### `get_ad_accounts`
Lists all ad accounts the user has access to.

### `get_campaigns`
Lists campaigns in an ad account. Filterable by status (ACTIVE, PAUSED, etc).

### `get_ad_sets`
Lists ad sets within a specific campaign.

### `get_ads`
Lists ads within a specific ad set.

### `get_insights`
Pulls performance metrics (impressions, clicks, spend, CPC, CPM, CTR, reach) for any ad object. Supports date presets, custom date ranges, breakdowns (age, gender, country, placement), and aggregation levels.

### `get_audiences`
Lists custom and lookalike audiences for an ad account.

## Environment Variables
| Variable | Description |
|----------|-------------|
| `META_APP_ID` | Facebook App ID from developers.facebook.com |
| `META_APP_SECRET` | Facebook App Secret |

## API Reference
- [Meta Marketing API](https://developers.facebook.com/docs/marketing-apis/)
- [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
