# Google Ads Skill

You have access to a Google Ads connector with full read, create, update, and remove capabilities. Use these tools to help the user analyse, manage, and build their Google Ads campaigns entirely from Claude.

## Read Tools

### `list_customers`
Lists all Google Ads customer accounts accessible by the user. Start here to find the right customer ID.

### `get_campaigns`
Lists campaigns with status, channel type, bidding strategy, budget, and basic metrics. Can filter by status.

### `get_ad_groups`
Lists ad groups within a campaign with metrics and resource names.

### `get_ads`
Lists ads within an ad group — type, status, headlines, descriptions, final URLs, and metrics.

### `get_keywords`
Lists keywords within an ad group — text, match type, status, bids, and performance metrics.

### `get_performance_report`
Flexible performance reporting via GAQL. Supports campaign/ad_group/ad_group_ad level, custom date ranges, and configurable metrics.

### `get_search_terms`
Shows what people actually searched for that triggered ads. Essential for keyword discovery and negative keyword identification.

### `get_campaign_budgets`
Lists campaign budgets with amounts, delivery method, and sharing status.

### `get_bidding_strategies`
Lists portfolio bidding strategies with types and campaign counts.

### `get_change_history`
Shows recent account changes — who changed what, when, and old/new values. Filter by date range and resource type.

### `get_audience_segments`
Lists audience segments available for targeting.

### `get_geo_targets`
Searches for geographic targeting locations by name (cities, regions, countries).

### `run_gaql_query`
Executes arbitrary GAQL queries for custom analysis beyond what other tools provide.

## Create Tools

### `create_campaign_budget`
Creates a campaign budget. Amount is in micros. Returns the budget resource name needed for `create_campaign`.

### `create_campaign`
Creates a campaign (PAUSED by default). Requires a budget resource name. Supports SEARCH, DISPLAY, SHOPPING, VIDEO, PERFORMANCE_MAX channel types and various bidding strategies.

### `create_ad_group`
Creates an ad group within a campaign with optional CPC bid and type.

### `create_responsive_search_ad`
Creates a Responsive Search Ad (RSA) with 3-15 headlines and 2-4 descriptions. Google tests combinations automatically.

### `add_keywords`
Batch-adds keywords to an ad group with match types (EXACT, PHRASE, BROAD) and optional per-keyword bids.

### `add_negative_keywords`
Adds negative keywords at campaign or ad group level to exclude search terms.

### `create_label`
Creates a label with optional colors for organizing entities.

### `apply_label`
Applies a label to a campaign, ad group, or ad.

## Update Tools

### `update_campaign_budget`
Updates a budget's amount or name.

### `update_campaign`
Updates campaign name, status (pause/enable), or bidding strategy.

### `update_ad_group`
Updates ad group name, status, or CPC bid.

### `update_ad`
Pauses or enables an ad.

### `update_keyword`
Updates a keyword's status or CPC bid.

## Remove Tools

### `remove_campaign`
Removes a campaign (sets status to REMOVED permanently).

### `remove_ad_group`
Removes an ad group and all its ads and keywords.

### `remove_ad`
Removes an ad from an ad group.

### `remove_keyword`
Removes a keyword from an ad group.

## Common Workflows

**"How are my campaigns performing?"**
1. `list_customers` to find the customer ID
2. `get_performance_report` with `date_range: "LAST_7_DAYS"`, `resource: "campaign"`

**"Create a new search campaign from scratch"**
1. `create_campaign_budget` with daily budget (e.g. `50000000` for $50/day)
2. `create_campaign` with the budget resource name, `SEARCH` channel, and bidding strategy
3. `create_ad_group` in the new campaign with a CPC bid
4. `add_keywords` to the ad group with match types
5. `create_responsive_search_ad` with headlines, descriptions, and landing URLs

**"Pause underperforming keywords"**
1. `get_keywords` to review metrics
2. `update_keyword` with `status: "PAUSED"` for low performers

**"Add negative keywords from search terms"**
1. `get_search_terms` with `date_range: "LAST_30_DAYS"`
2. Identify irrelevant terms
3. `add_negative_keywords` at campaign level

**"Quick account audit"**
1. `get_change_history` to see recent modifications
2. `run_gaql_query` for custom deep-dive queries
3. `get_performance_report` to review metrics trends

**"Reorganise campaigns with labels"**
1. `create_label` with a descriptive name and color
2. `apply_label` to relevant campaigns, ad groups, or ads
3. Use labels for filtered reporting

## Tips
- Cost values are in **micros** — divide by 1,000,000 for actual currency (e.g. `50000000` = $50)
- Customer IDs are 10 digits with no dashes (e.g. `1234567890` not `123-456-7890`)
- If the user manages multiple accounts via an MCC, they may need to provide `login_customer_id`
- Resource names are returned by read tools — use them for update/remove operations
- Campaigns are created as PAUSED by default — enable them explicitly when ready
- RSAs need 3-15 headlines (max 30 chars) and 2-4 descriptions (max 90 chars)
- Write operations do not auto-retry to prevent duplicates
- Present data in tables when showing metrics and always convert micros to readable currency
