# Meta Ads Connector

## Overview
Connects to the Meta (Facebook) Marketing API to read and manage ad account data, campaigns, ad sets, ads, performance insights, audiences, and Advantage+ configuration.

## Authentication
- **Type:** OAuth2 Authorization Code
- **Scopes:** `ads_read`, `ads_management`
- **Graph API version:** `v23.0`
- **Token URL:** `https://graph.facebook.com/v23.0/oauth/access_token`
- **Authorize URL:** `https://www.facebook.com/v23.0/dialog/oauth`

## Tools

### `get_ad_accounts`
Lists all ad accounts the user has access to.

### `get_campaigns`
Lists campaigns in an ad account. Filterable by status.

Returns raw campaign fields plus Advantage+ signals:
- `objective`, `buying_type`, `special_ad_categories`
- `daily_budget`, `lifetime_budget`, `budget_remaining`, `is_budget_schedule_enabled`
- `smart_promotion_type` — legacy Advantage+ campaign type (pre-v25)
- `advantage_state_info` — current Advantage+ state (`ADVANTAGE_PLUS_SALES`, `ADVANTAGE_PLUS_APP`, `ADVANTAGE_PLUS_LEADS`, `DISABLED`)

Derived helper:
- `advantage_campaign_budget_enabled` — `true` when a campaign-level `daily_budget` or `lifetime_budget` is set (CBO on).

### `get_ad_sets`
Lists ad sets within a campaign. Returns the full `targeting` tree (including sub-objects normally omitted by the Graph default view) plus derived Advantage+ booleans.

Targeting sub-fields surfaced:
`age_min`, `age_max`, `genders`, `geo_locations`, `flexible_spec`, `exclusions`, `custom_audiences`, `excluded_custom_audiences`, `publisher_platforms`, `facebook_positions`, `instagram_positions`, `audience_network_positions`, `messenger_positions`, `device_platforms`, `targeting_optimization`, `targeting_relaxation_types`, `targeting_automation`.

Also returns: `bid_strategy`, `bid_amount`, `optimization_goal`, `billing_event`, `promoted_object`, `is_dynamic_creative`.

Derived helpers per ad set:
- `advantage_plus_placements_on` — all six placement arrays absent/null.
- `advantage_detailed_targeting_on` — `targeting.targeting_optimization == "expansion_all"` (or truthy).
- `advantage_detailed_targeting_raw` — passes through the raw value (historically `0` / `1`).
- `advantage_lookalike_on` — `targeting.targeting_relaxation_types.lookalike == 1`.
- `advantage_custom_audience_on` — `targeting.targeting_relaxation_types.custom_audience == 1`.
- `advantage_plus_audience_on` — `targeting.targeting_automation.advantage_audience == 1`.

### `get_ads`
Lists ads within an ad set. Returns the full creative via field expansion — `object_story_spec`, `asset_feed_spec`, and `degrees_of_freedom_spec.creative_features_spec`.

Derived helpers per ad:
- `advantage_creative_features_on` — list of `creative_features_spec` keys with `enroll_status == "OPT_IN"`.
- `advantage_creative_features_off` — list with `enroll_status == "OPT_OUT"`.

### `get_ad_creative`
Fetches a single ad creative by ID with the full `degrees_of_freedom_spec.creative_features_spec`. Use after `get_ads` when you need to drill into one creative.

Input: `creative_id`.

### `get_ad_full_context`
One-shot lookup that returns an ad together with its ad set, parent campaign, full creative, and a unified `advantage_summary` block. Saves three round trips when answering "what's actually configured on this live ad".

Input: `ad_id`.

Output shape:
```json
{
  "ad": { ... },
  "ad_set": { ... },
  "campaign": { ... },
  "creative": { ... },
  "advantage_summary": {
    "advantage_campaign_budget_enabled": bool,
    "advantage_plus_placements_on": bool,
    "advantage_detailed_targeting_on": bool,
    "advantage_detailed_targeting_raw": 0 | 1 | "expansion_all" | null,
    "advantage_lookalike_on": bool,
    "advantage_custom_audience_on": bool,
    "advantage_plus_audience_on": bool,
    "advantage_creative_features_on": [string],
    "advantage_creative_features_off": [string]
  }
}
```

### `get_insights`
Pulls performance metrics (impressions, clicks, spend, CPC, CPM, CTR, reach) and conversion data (actions, cost per action type, action values, conversions, conversion values, purchase ROAS, website purchase ROAS) for any ad object. Supports date presets, custom date ranges, breakdowns (age, gender, country, placement), and aggregation levels.

### `get_audiences`
Lists custom and lookalike audiences for an ad account.

### `update_campaign`
Update a campaign's status, name, or budget. Supports: `name`, `status` (ACTIVE/PAUSED/DELETED/ARCHIVED), `daily_budget`, `lifetime_budget`, `special_ad_categories`. Budget values are in cents.

### `update_ad_set`
Update an ad set's status, name, budget, targeting, bid, or schedule. Supports: `name`, `status`, `daily_budget`, `lifetime_budget`, `bid_amount`, `billing_event`, `optimization_goal`, `targeting` (JSON), `start_time`, `end_time`. Budget and bid values are in cents.

### `update_ad`
Update an ad's status, name, or creative. Supports: `name`, `status` (ACTIVE/PAUSED/DELETED/ARCHIVED), `creative` (JSON).

## Environment Variables
| Variable | Description |
|----------|-------------|
| `META_APP_ID` | Facebook App ID from developers.facebook.com |
| `META_APP_SECRET` | Facebook App Secret |

## API Reference
- [Meta Marketing API](https://developers.facebook.com/docs/marketing-apis/)
- [Advantage+ Creative / creative_features_spec](https://developers.facebook.com/docs/marketing-api/reference/ad-creative-features-spec)
- [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
