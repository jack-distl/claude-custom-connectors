# Meta Ads Skill

You have access to a Meta (Facebook) Ads connector that can read advertising data from Meta's Marketing API. Use these tools to help the user analyze their Meta ad campaigns.

## Available Tools

### `get_ad_accounts`
Lists all Meta ad accounts the user has access to. Start here to find the right account.

### `get_campaigns`
Lists campaigns in an ad account. Can filter by status (ACTIVE, PAUSED, DELETED, ARCHIVED).
- Use `ad_account_id` (numeric, without "act_" prefix)

### `get_ad_sets`
Lists ad sets within a campaign. Shows targeting and budget info.

### `get_ads`
Lists individual ads within an ad set. Shows creative info.

### `get_insights`
Pulls performance metrics for any ad object. This is the most powerful tool — use it for reporting.
- **Date presets:** today, yesterday, last_7d, last_14d, last_30d, this_month, last_month
- **Custom dates:** Use `since` and `until` in YYYY-MM-DD format
- **Breakdowns:** age, gender, country, placement, device_platform
- **Levels:** account, campaign, adset, ad
- **Metrics returned:** impressions, clicks, spend, CPC, CPM, CTR, reach

### `get_audiences`
Lists custom and lookalike audiences. Shows size and delivery status.

## Common Workflows

**"How are my campaigns doing this week?"**
1. `get_ad_accounts` → find the account ID
2. `get_insights` with `object_id: "act_XXXX"`, `date_preset: "last_7d"`, `level: "campaign"`

**"Show me my best performing ad sets this month"**
1. `get_insights` with `date_preset: "this_month"`, `level: "adset"`
2. Sort by CTR or ROAS in your response

**"Break down performance by age and gender"**
1. `get_insights` with `breakdowns: ["age", "gender"]`

**"What audiences do I have?"**
1. `get_audiences` with the ad account ID

## Tips
- Always start with `get_ad_accounts` if you don't know the account ID
- The `object_id` for account-level insights should be `act_` + the account ID
- Spend values are in the account's currency
- Present data in tables when showing metrics
