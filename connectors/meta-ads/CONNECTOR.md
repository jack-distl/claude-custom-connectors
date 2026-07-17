# Meta Ads Connector

## Overview
Connects to the Meta (Facebook) Marketing API to read and manage ad account data, campaigns, ad sets, ads, performance insights, audiences, and Advantage+ configuration.

## Authentication
- **Type:** OAuth2 Authorization Code
- **Scopes:** `ads_read`, `ads_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`, `leads_retrieval`
- **Graph API version:** `v23.0`
- **Token URL:** `https://graph.facebook.com/v23.0/oauth/access_token`
- **Authorize URL:** `https://www.facebook.com/v23.0/dialog/oauth`

> **Re-auth required:** the Page/leadgen scopes (`pages_show_list`, `pages_read_engagement`, `pages_manage_ads`, `leads_retrieval`) were added to support `get_lead_forms`, `get_form_leads`, and page-post destination resolution. Any user connected before this change must **reconnect** to grant them.
>
> **App Review:** `leads_retrieval` typically requires Meta **App Review (Advanced Access)** before it works for users who are not admins/developers of the app. The leadgen tools will fail with a permissions error until that is granted. The Page token holder must also have a lead-access (MANAGE) role on the Page.
>
> **Page access tokens:** the leadgen edges and a page post's `call_to_action` require a *Page* access token, not the user token. The connector derives it automatically from the user token via `/me/accounts`, so the authenticated user must have a role on the relevant Page.

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

Also returns: `bid_strategy`, `bid_amount`, `optimization_goal`, `billing_event`, `promoted_object`, `is_dynamic_creative`, and **`destination_type`** — the conversion location (`WEBSITE`, `ON_AD`, or an instant-form value). This is the deciding flag between "Website", "Instant forms", and "Website and instant forms"; an "OFFSITE_CONVERSIONS / Website" ad set that is actually serving instant forms will differ here.

Supports `limit`, an `after` pagination cursor (returns `paging.cursors`), and an additive `fields` passthrough (extra Graph fields appended to the defaults).

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

Supports `limit`, an `after` pagination cursor (returns `paging.cursors`), and an additive `fields` passthrough.

Set `resolve_destination: true` to attach a `lead_destination` block per ad (see below). This resolves page-post-backed creatives via the underlying post and therefore adds Graph calls proportional to the number of ads — leave it off for plain listing.

### `get_ad_creative`
Fetches a single ad creative by ID with the full `degrees_of_freedom_spec.creative_features_spec`. Use after `get_ads` when you need to drill into one creative. Always returns a `lead_destination` block.

Input: `creative_id`.

### `lead_destination` block
Returned by `get_ad_creative`, `get_ad_full_context`, and (when `resolve_destination=true`) `get_ads`. Surfaces where an ad actually sends people — whether the creative spec is inline or built from an existing page post (which returns only `effective_object_story_id`, no inline spec).

```json
{
  "lead_gen_form_id": "3034461123400304" | null,
  "link": "https://..." | null,
  "call_to_action_type": "SIGN_UP" | null,
  "source": "inline_object_story_spec" | "asset_feed_spec" | "page_post" | "none",
  "resolution_error": "..."
}
```

Resolution order: inline `object_story_spec.{link_data|video_data|photo_data}.call_to_action.value.{lead_gen_form_id,link}` (incl. carousel `child_attachments`) → `asset_feed_spec.link_urls[].website_url` (link only) → the underlying post's `call_to_action` (resolved with a Page token). `resolution_error` is set instead of failing if the post can't be read.

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
  "lead_destination": { ... },
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

### `get_account_creative_freedom`
Answers **"which ads in this account have Advantage+ Creative / AI enhancements enabled"** in a single call. Walks every campaign → ad set → ad in the account **server-side**, following all pagination to exhaustion (500 per page), so the caller never has to chase `after` cursors and can't silently under-report. It reuses the same creative expansion as `get_ads` (`degrees_of_freedom_spec.creative_features_spec`) — no per-ad `get_ad_creative` call.

Inputs:
- `ad_account_id` — numeric, no `act_` prefix.
- `status` — optional, filters **ads** by effective status (default `ACTIVE`). Campaigns and ad sets are always fully traversed.
- `include_features` — optional array; restricts `features_on` / `features_off` and the `summary` to these feature keys. A top-level key (e.g. `enhance_cta`) also keeps its nested customizations (`enhance_cta.text_extraction`). `features_raw` is always returned verbatim.

**Nested flags:** `creative_features_spec` is not flat — a feature can be `OPT_OUT` at the top level while a customization nested under `customizations` is `OPT_IN`. These are flattened to dotted keys (`enhance_cta.text_extraction`) and treated as first-class entries in the on/off arrays, so an ad that looks clean at the top level but has an enhancement enabled underneath is still surfaced. Unknown feature keys pass through rather than being dropped.

**No silent partial results:** ad set and ad walks run in parallel with a concurrency cap and retry/backoff on Graph rate-limit errors (codes 4, 17, 613). If a page still fails, the whole call raises an error naming the campaign or ad set that failed — a loud failure instead of a short list that looks complete.

Output shape (one flat row per ad, plus a summary):
```json
{
  "ad_account_id": "123",
  "ads_scanned": 42,
  "ads": [
    {
      "ad_id": "...", "ad_name": "...", "ad_status": "ACTIVE",
      "adset_id": "...", "adset_name": "...",
      "campaign_id": "...", "campaign_name": "...",
      "creative_id": "...",
      "features_on": ["image_uncrop", "site_extensions", "enhance_cta.text_extraction"],
      "features_off": ["enhance_cta"],
      "features_raw": { "...": "creative_features_spec verbatim" }
    }
  ],
  "summary": { "image_uncrop": 12, "enhance_cta.text_extraction": 3 }
}
```
`summary` maps each feature key to the count of ads with it **ON** — the "how many" that always follows "which".

### `get_insights`
Pulls performance metrics (impressions, clicks, spend, CPC, CPM, CTR, reach) and conversion data (actions, cost per action type, action values, conversions, conversion values, purchase ROAS, website purchase ROAS) for any ad object. Supports date presets, custom date ranges, breakdowns (age, gender, country, placement, `action_type`), aggregation levels, and `action_attribution_windows`.

Every row also carries entity identifiers based on the requested `level`: `campaign_id`, `campaign_name`, `adset_id`, `adset_name`, `ad_id`, `ad_name`. This lets a result (e.g. an `onsite_conversion.lead_grouped` action in `actions[]`) be attributed to a specific entity — e.g. `level="ad"` returns one row per ad so you can see exactly which ad is serving instant forms. Also supports an additive `fields` passthrough.

### `get_audiences`
Lists custom and lookalike audiences for an ad account.

### `get_lead_forms`
Lists the instant / lead-gen forms on a Facebook Page (including any auto-created by Meta) with their lead counts. Returns `id`, `name`, `status`, `created_time`, `leads_count`, `expired_leads_count`, `locale`, `questions`. Uses a derived Page access token, so the user must have a role on the Page. Supports `limit`, `after`, and `fields`.

Input: `page_id` (required).

### `get_form_leads`
Retrieves the leads collected by a lead-gen / instant form. On-Meta form leads never hit the website or pixel, so they may sit uncollected in Meta — this pulls them so they can be pushed to a CRM. Returns `field_data`, `created_time`, `ad_id`, `form_id`, `campaign_id` per lead, paginated (`paging.cursors`). Uses a derived Page access token.

Inputs: `leadgen_form_id` (required), `page_id` (optional — resolved from the form if omitted), `limit`, `after`, `fields`.

### Pagination & `fields` passthrough
The list tools (`get_campaigns`, `get_ad_sets`, `get_ads`, `get_lead_forms`, `get_form_leads`) accept an `after` cursor and return `paging.cursors` for clean pagination. The read tools (`get_campaigns`, `get_ad_sets`, `get_ads`, `get_insights`, `get_lead_forms`, `get_form_leads`) accept an optional `fields` array that is **appended** to the curated defaults (de-duplicated), so new Graph fields can be requested ad hoc without a code change.

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
